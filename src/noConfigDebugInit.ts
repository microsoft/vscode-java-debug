// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

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
 * - `JAVA_TOOL_OPTIONS`: JDWP configuration for automatic debugging.
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
        console.error('[Java Debug] No workspace folder found');
        return Promise.resolve(new vscode.Disposable(() => {}));
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
                console.error(`[Java Debug] Failed to cleanup old endpoint file: ${err}`);
            });
        }
    }

    // clear the env var collection to remove any existing env vars
    collection.clear();

    // Add env var for VSCODE_JDWP_ADAPTER_ENDPOINTS
    // Note: We do NOT set JAVA_TOOL_OPTIONS globally to avoid affecting all Java processes
    // (javac, maven, gradle, language server, etc.). Instead, JAVA_TOOL_OPTIONS is set
    // only in the javadebug wrapper scripts (javadebug.ps1, javadebug.bat, javadebug)
    collection.replace('VSCODE_JDWP_ADAPTER_ENDPOINTS', tempFilePath);

    const noConfigScriptsDir = path.join(extPath, 'bundled', 'scripts', 'noConfigScripts');
    const pathSeparator = process.platform === 'win32' ? ';' : ':';

    // Check if the current PATH already ends with a path separator to avoid double separators
    const currentPath = process.env.PATH || '';
    const needsSeparator = currentPath.length > 0 && !currentPath.endsWith(pathSeparator);
    const pathValueToAppend = needsSeparator ? `${pathSeparator}${noConfigScriptsDir}` : noConfigScriptsDir;

    collection.append('PATH', pathValueToAppend);

    // create file system watcher for the debuggerAdapterEndpointFolder for when the communication port is written
    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(tempDirPath, '**/*.txt')
    );
    
    // Track active debug sessions to prevent duplicates
    const activeDebugSessions = new Set<number>();
    
    // Handle both file creation and modification to support multiple runs
    const handleEndpointFile = async (uri: vscode.Uri) => {
        console.log('[Java Debug] No-config debug session detected');

        const filePath = uri.fsPath;
        
        // Add a small delay to ensure file is fully written
        // File system events can fire before write is complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                console.error(`[Java Debug] Error reading endpoint file: ${err}`);
                return;
            }
            try {
                // parse the client port
                const dataParse = data.toString();
                const jsonData = JSON.parse(dataParse);
                
                // Validate JSON structure
                if (!jsonData || typeof jsonData !== 'object' || !jsonData.client) {
                    console.error(`[Java Debug] Invalid endpoint file format: ${dataParse}`);
                    return;
                }
                
                const clientPort = jsonData.client.port;
                
                // Validate port number
                if (!clientPort || typeof clientPort !== 'number' || clientPort < 1 || clientPort > 65535) {
                    console.error(`[Java Debug] Invalid port number: ${clientPort}`);
                    return;
                }
                
                // Check if we already have an active session for this port
                if (activeDebugSessions.has(clientPort)) {
                    console.log(`[Java Debug] Debug session already active for port ${clientPort}, skipping`);
                    return;
                }
                
                console.log(`[Java Debug] Parsed JDWP port: ${clientPort}`);
                
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
                            console.log('[Java Debug] Successfully started no-config debug session');
                            // Clean up the endpoint file after successful debug session start (async)
                            if (fs.existsSync(filePath)) {
                                fs.promises.unlink(filePath).then(() => {
                                    console.log('[Java Debug] Cleaned up endpoint file');
                                }).catch((cleanupErr) => {
                                    console.error(`[Java Debug] Failed to cleanup endpoint file: ${cleanupErr}`);
                                });
                            }
                        } else {
                            console.error('[Java Debug] Error starting debug session, session not started.');
                            // Remove from active sessions on failure
                            activeDebugSessions.delete(clientPort);
                        }
                    },
                    (error) => {
                        console.error(`[Java Debug] Error starting debug session: ${error}`);
                        // Remove from active sessions on error
                        activeDebugSessions.delete(clientPort);
                    },
                );
            } catch (parseErr) {
                console.error(`[Java Debug] Error parsing JSON: ${parseErr}`);
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
            console.log(`[Java Debug] Debug session ended for port ${port}`);
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
