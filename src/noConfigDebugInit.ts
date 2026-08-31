// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

import { sendInfo, sendError } from "vscode-extension-telemetry-wrapper";
import { getJavaHome } from "./utility";
import { buildNoConfigPathAppendValue } from "./pathUtil";
import { applyAppendIfChanged, applyReplaceIfChanged } from "./envVarSync";

const ENV_VAR_COLLECTION_DESCRIPTION = "Java No-Config Debug";

/**
 * Ensures the POSIX no-config debug wrapper can be invoked from a terminal.
 *
 * Official VSIX packages are built on Windows, where executable bits are not
 * preserved. Repair the installed script when the extension activates on a
 * POSIX platform, while preserving all existing permissions and avoiding an
 * unnecessary chmod when the owner can already execute it.
 *
 * @param scriptPath - The installed debugjava wrapper path.
 * @param platform - The current operating system platform.
 */
export async function ensureDebugJavaScriptExecutable(
    scriptPath: string,
    platform: NodeJS.Platform = process.platform,
): Promise<void> {
    if (platform === "win32") {
        return;
    }

    const permissions = (await fs.promises.stat(scriptPath)).mode % 0o10000;
    const ownerPermissions = Math.floor(permissions / 0o100);
    if (ownerPermissions % 2 === 0) {
        await fs.promises.chmod(scriptPath, permissions + 0o100);
    }
}

/**
 * Registers the configuration-less debugging setup for the extension.
 *
 * This function sets up environment variables and a file system watcher to
 * facilitate debugging without requiring a pre-configured launch.json file.
 *
 * @param envVarCollection - The collection of environment variables to be modified.
 * @param extPath - The path to the extension directory.
 *
 * Environment Variables:
 * - `VSCODE_JDWP_ADAPTER_ENDPOINTS`: Path to the file containing the debugger adapter endpoint.
 * - `VSCODE_JAVA_EXEC`: Path to the java executable from the Java Language Server (when available).
 * - `PATH`: Appends the path to the noConfigScripts directory.
 */
export async function registerNoConfigDebug(
    envVarCollection: vscode.EnvironmentVariableCollection,
    extPath: string,
): Promise<vscode.Disposable> {
    const collection = envVarCollection;

    // create a temp directory for the noConfigDebugAdapterEndpoints
    // file path format: extPath/.noConfigDebugAdapterEndpoints/endpoint-stableWorkspaceHash.txt
    let workspaceString = vscode.workspace.workspaceFile?.fsPath;
    if (!workspaceString) {
        workspaceString = vscode.workspace.workspaceFolders?.map((e) => e.uri.fsPath).join(';');
    }
    if (!workspaceString) {
        const error: Error = {
            name: "NoConfigDebugError",
            message: '[Java Debug] No workspace folder found',
        };
        sendError(error);
        return Promise.resolve(new vscode.Disposable(() => { }));
    }

    // create a stable hash for the workspace folder, reduce terminal variable churn
    const hash = crypto.createHash('sha256');
    hash.update(workspaceString.toString());
    const stableWorkspaceHash = hash.digest('hex').slice(0, 16);

    const tempDirPath = path.join(extPath, '.noConfigDebugAdapterEndpoints');
    const tempFilePath = path.join(tempDirPath, `endpoint-${stableWorkspaceHash}.txt`);

    // create the temp directory if it doesn't exist
    if (!fs.existsSync(tempDirPath)) {
        fs.mkdirSync(tempDirPath, { recursive: true });
    } else {
        // remove endpoint file in the temp directory if it exists (async to avoid blocking)
        if (fs.existsSync(tempFilePath)) {
            fs.promises.unlink(tempFilePath).catch((err) => {
                const error: Error = {
                    name: "NoConfigDebugError",
                    message: `[Java Debug] Failed to cleanup old endpoint file: ${err}`,
                };
                sendError(error);
            });
        }
    }

    // Surface a description in VS Code's environment variable UI so users can
    // see which extension is contributing these variables.
    if (collection.description !== ENV_VAR_COLLECTION_DESCRIPTION) {
        collection.description = ENV_VAR_COLLECTION_DESCRIPTION;
    }

    // Apply our managed variables using diff-aware helpers. On a typical
    // window reload the values are unchanged and these calls are no-ops, so
    // VS Code does not prompt the user to restart their existing terminals.
    // See issue #1647.
    //
    // Note: We do NOT set JAVA_TOOL_OPTIONS globally to avoid affecting all Java processes
    // (javac, maven, gradle, language server, etc.). Instead, JAVA_TOOL_OPTIONS is set
    // only in the debugjava wrapper scripts (debugjava.ps1, debugjava.bat, debugjava)
    applyReplaceIfChanged(collection, 'VSCODE_JDWP_ADAPTER_ENDPOINTS', tempFilePath);

    // Try to get Java executable from Java Language Server
    // This ensures we use the same Java version as the project is compiled with.
    // If detection fails or returns nothing, we deliberately keep any previously
    // set VSCODE_JAVA_EXEC to avoid churn from transient startup failures.
    try {
        const javaHome = await getJavaHome();
        if (javaHome) {
            const javaExec = path.join(javaHome, 'bin', 'java');
            applyReplaceIfChanged(collection, 'VSCODE_JAVA_EXEC', javaExec);
        }
    } catch (error) {
        // If we can't get Java from Language Server, that's okay
        // The wrapper script will fall back to JAVA_HOME or PATH
    }

    const noConfigScriptsDir = path.join(extPath, 'bundled', 'scripts', 'noConfigScripts');
    const debugJavaScriptPath = path.join(noConfigScriptsDir, "debugjava");
    try {
        await ensureDebugJavaScriptExecutable(debugJavaScriptPath);
    } catch (err) {
        const error: Error = {
            name: "NoConfigDebugError",
            message: `[Java Debug] Failed to make debugjava executable: ${err}`,
        };
        sendError(error);
    }
    applyAppendIfChanged(collection, 'PATH', buildNoConfigPathAppendValue(noConfigScriptsDir));

    // create file system watcher for the debuggerAdapterEndpointFolder for when the communication port is written
    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(tempDirPath, '**/*.txt')
    );

    // Track active debug sessions to prevent duplicates
    const activeDebugSessions = new Set<number>();

    // Handle both file creation and modification to support multiple runs
    const handleEndpointFile = async (uri: vscode.Uri) => {
        const filePath = uri.fsPath;

        // Add a small delay to ensure file is fully written
        // File system events can fire before write is complete
        await new Promise(resolve => setTimeout(resolve, 100));

        fs.readFile(filePath, (err, data) => {
            if (err) {
                const error: Error = {
                    name: "NoConfigDebugError",
                    message: `[Java Debug] No-config debug failed: file_read_error - ${err}`,
                };
                sendError(error);
                return;
            }
            try {
                // parse the client port
                const dataParse = data.toString();
                const jsonData = JSON.parse(dataParse);

                // Validate JSON structure
                if (!jsonData || typeof jsonData !== 'object' || !jsonData.client) {
                    const error: Error = {
                        name: "NoConfigDebugError",
                        message: `[Java Debug] No-config debug failed: invalid_format - ${dataParse}`,
                    };
                    sendError(error);
                    return;
                }

                const clientPort = jsonData.client.port;

                // Validate port number
                if (!clientPort || typeof clientPort !== 'number' || clientPort < 1 || clientPort > 65535) {
                    const error: Error = {
                        name: "NoConfigDebugError",
                        message: `[Java Debug] No-config debug failed: invalid_port - ${clientPort}`,
                    };
                    sendError(error);
                    return;
                }

                // Check if we already have an active session for this port
                if (activeDebugSessions.has(clientPort)) {
                    // Skip duplicate session silently - this is expected behavior
                    return;
                }

                // Mark this port as active
                activeDebugSessions.add(clientPort);

                const options: vscode.DebugSessionOptions = {
                    noDebug: false,
                };

                // start debug session with the client port
                vscode.debug.startDebugging(
                    undefined,
                    {
                        type: 'java',
                        request: 'attach',
                        name: 'Attach to Java (No-Config)',
                        hostName: 'localhost',
                        port: clientPort,
                    },
                    options,
                ).then(
                    (started) => {
                        if (started) {
                            // Send telemetry only on successful session start with port info
                            sendInfo('', { message: '[Java Debug] No-config debug session started', port: clientPort });
                            // Clean up the endpoint file after successful debug session start (async)
                            if (fs.existsSync(filePath)) {
                                fs.promises.unlink(filePath).catch((cleanupErr) => {
                                    // Cleanup failure is non-critical, just log for debugging
                                    const error: Error = {
                                        name: "NoConfigDebugError",
                                        message: `[Java Debug] No-config debug failed: cleanup_error - ${cleanupErr}`,
                                    };
                                    sendError(error);
                                });
                            }
                        } else {
                            const error: Error = {
                                name: "NoConfigDebugError",
                                message: `[Java Debug] No-config debug failed: attach_failed - port ${clientPort}`,
                            };
                            sendError(error);
                            // Remove from active sessions on failure
                            activeDebugSessions.delete(clientPort);
                        }
                    },
                    (error) => {
                        const attachError: Error = {
                            name: "NoConfigDebugError",
                            message: `[Java Debug] No-config debug failed: attach_error - port ${clientPort} - ${error}`,
                        };
                        sendError(attachError);
                        // Remove from active sessions on error
                        activeDebugSessions.delete(clientPort);
                    },
                );
            } catch (parseErr) {
                const error: Error = {
                    name: "NoConfigDebugError",
                    message: `[Java Debug] No-config debug failed: parse_error - ${parseErr}`,
                };
                sendError(error);
            }
        });
    };

    // Listen for both file creation and modification events
    const fileCreationEvent = fileSystemWatcher.onDidCreate(handleEndpointFile);
    const fileChangeEvent = fileSystemWatcher.onDidChange(handleEndpointFile);

    // Clean up active sessions when debug session ends
    const debugSessionEndListener = vscode.debug.onDidTerminateDebugSession((session) => {
        if (session.name === 'Attach to Java (No-Config)' && session.configuration.port) {
            const port = session.configuration.port;
            activeDebugSessions.delete(port);
            // Session end is normal operation, no telemetry needed
        }
    });

    return Promise.resolve(
        new vscode.Disposable(() => {
            fileSystemWatcher.dispose();
            fileCreationEvent.dispose();
            fileChangeEvent.dispose();
            debugSessionEndListener.dispose();
            activeDebugSessions.clear();
        }),
    );
}
