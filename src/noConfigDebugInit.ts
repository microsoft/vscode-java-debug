// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { sendInfo, sendError } from "vscode-extension-telemetry-wrapper";
import { getJavaHome } from "./utility";
import { buildNoConfigPathAppendValue } from "./pathUtil";
import { applyAppendIfChanged, applyReplaceIfChanged } from "./envVarSync";

const ENV_VAR_COLLECTION_DESCRIPTION = "Java No-Config Debug";

export type NoConfigDebugResult =
    | { status: "ready" | "disabled" | "disposed" }
    | { status: "failed"; message: string };

export type NoConfigDebugWaitResult = NoConfigDebugResult | { status: "cancelled" | "timeout" };

export interface NoConfigDebugRegistration extends vscode.Disposable {
    readonly ready: Promise<NoConfigDebugResult>;
    waitUntilReady(token: vscode.CancellationToken, timeoutMs?: number): Promise<NoConfigDebugWaitResult>;
}

interface InitializationLifetime {
    token: vscode.CancellationToken;
    disposables: vscode.Disposable[];
}

function clearNoConfigDebugEnvironment(collection: vscode.EnvironmentVariableCollection): void {
    for (const variable of ["VSCODE_JDWP_ADAPTER_ENDPOINTS", "VSCODE_JAVA_EXEC", "PATH"]) {
        if (collection.get(variable)) {
            collection.delete(variable);
        }
    }
    if (collection.description !== undefined) {
        collection.description = undefined;
    }
}

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
 * @param token - Stops further permission work when initialization is disposed.
 */
export async function ensureDebugJavaScriptExecutable(
    scriptPath: string,
    platform: NodeJS.Platform = process.platform,
    token?: vscode.CancellationToken,
): Promise<void> {
    if (platform === "win32" || token?.isCancellationRequested) {
        return;
    }

    const permissions = (await fs.promises.stat(scriptPath)).mode % 0o10000;
    const ownerPermissions = Math.floor(permissions / 0o100);
    if (ownerPermissions % 2 === 0 && !token?.isCancellationRequested) {
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
 * @param storageUri - The workspace-specific storage directory provided by VS Code.
 * @param enabled - Whether no-config debugging is enabled for this activation.
 * @returns An immediately disposable registration with a shared initialization result.
 *
 * Environment Variables:
 * - `VSCODE_JDWP_ADAPTER_ENDPOINTS`: Path to the file containing the debugger adapter endpoint.
 * - `VSCODE_JAVA_EXEC`: Path to the java executable from the Java Language Server (when available).
 * - `PATH`: Appends the path to the noConfigScripts directory.
 */
export function registerNoConfigDebug(
    envVarCollection: vscode.EnvironmentVariableCollection,
    extPath: string,
    storageUri: vscode.Uri | undefined,
    enabled: boolean = true,
): NoConfigDebugRegistration {
    const cancellation = new vscode.CancellationTokenSource();
    const lifetime: InitializationLifetime = { token: cancellation.token, disposables: [] };
    let complete!: (result: NoConfigDebugResult) => void;
    const ready = new Promise<NoConfigDebugResult>((resolve) => { complete = resolve; });
    const releaseResources = () => {
        for (const disposable of lifetime.disposables.splice(0).reverse()) {
            disposable.dispose();
        }
    };

    // Handle the background task here so activation and AI callers never inherit a rejection.
    void initializeNoConfigDebug(envVarCollection, extPath, storageUri, enabled, lifetime).then(
        (result) => {
            if (!lifetime.token.isCancellationRequested) {
                if (result.status !== "ready") {
                    releaseResources();
                }
                complete(result);
            }
        },
        (error: unknown) => {
            if (lifetime.token.isCancellationRequested) {
                return;
            }
            releaseResources();
            clearNoConfigDebugEnvironment(envVarCollection);
            complete(reportInitializationFailure(error));
        },
    );

    return {
        ready,
        async waitUntilReady(token, timeoutMs = 60000): Promise<NoConfigDebugWaitResult> {
            if (token.isCancellationRequested) {
                return { status: "cancelled" };
            }
            let listener: vscode.Disposable | undefined;
            let timeout: NodeJS.Timeout | undefined;
            try {
                const result = await Promise.race([
                    ready,
                    new Promise<NoConfigDebugWaitResult>((resolve) => {
                        listener = token.onCancellationRequested(() => resolve({ status: "cancelled" }));
                        timeout = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
                    }),
                ]);
                if (token.isCancellationRequested) {
                    return { status: "cancelled" };
                }
                return lifetime.token.isCancellationRequested ? { status: "disposed" } : result;
            } finally {
                listener?.dispose();
                if (timeout) {
                    clearTimeout(timeout);
                }
            }
        },
        dispose() {
            if (lifetime.token.isCancellationRequested) {
                return;
            }
            cancellation.cancel();
            cancellation.dispose();
            releaseResources();
            complete({ status: "disposed" });
        },
    };
}

function reportInitializationFailure(error: unknown): NoConfigDebugResult {
    // Filesystem error messages can contain user paths; report only the error code.
    const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "unknown";
    const message = `Java No-Config Debug initialization failed (${code}).`;
    sendError({ name: "NoConfigDebugError", message: `[Java Debug] No-config debug initialization failed (${code}).` });
    vscode.window.showWarningMessage(`${message} Standard Java debugging is still available.`);
    return { status: "failed", message };
}

async function initializeNoConfigDebug(
    envVarCollection: vscode.EnvironmentVariableCollection,
    extPath: string,
    storageUri: vscode.Uri | undefined,
    enabled: boolean,
    lifetime: InitializationLifetime,
): Promise<NoConfigDebugResult> {
    const collection = envVarCollection;
    const { token, disposables } = lifetime;

    if (!enabled) {
        clearNoConfigDebugEnvironment(collection);
        return { status: "disabled" };
    }

    if (!storageUri) {
        clearNoConfigDebugEnvironment(collection);
        const error: Error = {
            name: "NoConfigDebugError",
            message: '[Java Debug] No workspace folder found',
        };
        sendError(error);
        return { status: "failed", message: "No workspace folder found for Java No-Config Debug." };
    }

    // Workspace storage is stable across reloads and does not require a writable
    // extension installation directory (for example, the Nix store).
    const tempDirPath = path.join(storageUri.fsPath, '.noConfigDebugAdapterEndpoints');
    const tempFilePath = path.join(tempDirPath, 'endpoint.txt');
    let fileSystemWatcher: vscode.FileSystemWatcher;

    try {
        await fs.promises.mkdir(tempDirPath, { recursive: true, mode: 0o700 });
        if (token.isCancellationRequested) {
            return { status: "disposed" };
        }
        // Finish removing stale data before watching or publishing the endpoint.
        await fs.promises.unlink(tempFilePath).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") {
                throw error;
            }
        });
        if (token.isCancellationRequested) {
            return { status: "disposed" };
        }
        fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(tempDirPath, path.basename(tempFilePath)),
        );
        disposables.push(fileSystemWatcher);
    } catch (error: unknown) {
        if (token.isCancellationRequested) {
            return { status: "disposed" };
        }
        clearNoConfigDebugEnvironment(collection);
        return reportInitializationFailure(error);
    }

    // Track active debug sessions to prevent duplicates
    const activeDebugSessions = new Set<number>();
    disposables.push(new vscode.Disposable(() => activeDebugSessions.clear()));

    // Handle both file creation and modification to support multiple runs
    const handleEndpointFile = async (uri: vscode.Uri) => {
        const filePath = uri.fsPath;

        // Add a small delay to ensure file is fully written
        // File system events can fire before write is complete
        await new Promise(resolve => setTimeout(resolve, 100));
        if (token.isCancellationRequested) {
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (token.isCancellationRequested) {
                return;
            }
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
                        if (token.isCancellationRequested) {
                            return;
                        }
                        if (started) {
                            // Send telemetry only on successful session start with port info
                            sendInfo('', { message: '[Java Debug] No-config debug session started', port: clientPort });
                            // Clean up the endpoint file after successful debug session start (async)
                            if (fs.existsSync(filePath)) {
                                fs.promises.unlink(filePath).catch((cleanupErr) => {
                                    if (token.isCancellationRequested) {
                                        return;
                                    }
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
                        if (token.isCancellationRequested) {
                            return;
                        }
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

    // Listen before publishing the endpoint or awaiting Java/script setup.
    // Terminals surviving a reload may already have the stable endpoint path.
    disposables.push(fileSystemWatcher.onDidCreate(handleEndpointFile));
    disposables.push(fileSystemWatcher.onDidChange(handleEndpointFile));

    // Clean up active sessions when debug session ends
    disposables.push(vscode.debug.onDidTerminateDebugSession((session) => {
        if (session.name === 'Attach to Java (No-Config)' && session.configuration.port) {
            const port = session.configuration.port;
            activeDebugSessions.delete(port);
            // Session end is normal operation, no telemetry needed
        }
    }));

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
        if (token.isCancellationRequested) {
            return { status: "disposed" };
        }
        if (javaHome) {
            const javaExec = path.join(javaHome, 'bin', 'java');
            applyReplaceIfChanged(collection, 'VSCODE_JAVA_EXEC', javaExec);
        }
    } catch (error) {
        // If we can't get Java from Language Server, that's okay
        // The wrapper script will fall back to JAVA_HOME or PATH
    }

    if (token.isCancellationRequested) {
        return { status: "disposed" };
    }
    const noConfigScriptsDir = path.join(extPath, 'bundled', 'scripts', 'noConfigScripts');
    const debugJavaScriptPath = path.join(noConfigScriptsDir, "debugjava");
    try {
        await ensureDebugJavaScriptExecutable(debugJavaScriptPath, process.platform, token);
    } catch (err) {
        if (token.isCancellationRequested) {
            return { status: "disposed" };
        }
        const error: Error = {
            name: "NoConfigDebugError",
            message: `[Java Debug] Failed to make debugjava executable: ${err}`,
        };
        sendError(error);
    }
    if (token.isCancellationRequested) {
        return { status: "disposed" };
    }
    applyAppendIfChanged(collection, 'PATH', buildNoConfigPathAppendValue(noConfigScriptsDir));

    return { status: "ready" };
}
