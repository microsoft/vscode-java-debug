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
        // remove endpoint file in the temp directory if it exists
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }

    // clear the env var collection to remove any existing env vars
    collection.clear();

    // Add env vars for VSCODE_JDWP_ADAPTER_ENDPOINTS and JAVA_TOOL_OPTIONS
    collection.replace('VSCODE_JDWP_ADAPTER_ENDPOINTS', tempFilePath);
    
    // Configure JDWP to listen on a random port and suspend until debugger attaches
    // quiet=y prevents the "Listening for transport..." message from appearing in terminal
    collection.replace('JAVA_TOOL_OPTIONS', 
        '-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0,quiet=y');

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
    
    const fileCreationEvent = fileSystemWatcher.onDidCreate(async (uri) => {
        console.log('[Java Debug] No-config debug session detected');

        const filePath = uri.fsPath;
        fs.readFile(filePath, (err, data) => {
            if (err) {
                console.error(`[Java Debug] Error reading endpoint file: ${err}`);
                return;
            }
            try {
                // parse the client port
                const dataParse = data.toString();
                const jsonData = JSON.parse(dataParse);
                const clientPort = jsonData.client?.port;
                console.log(`[Java Debug] Parsed JDWP port: ${clientPort}`);

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
                        } else {
                            console.error('[Java Debug] Error starting debug session, session not started.');
                        }
                    },
                    (error) => {
                        console.error(`[Java Debug] Error starting debug session: ${error}`);
                    },
                );
            } catch (parseErr) {
                console.error(`[Java Debug] Error parsing JSON: ${parseErr}`);
            }
        });
    });

    return Promise.resolve(
        new vscode.Disposable(() => {
            fileSystemWatcher.dispose();
            fileCreationEvent.dispose();
        }),
    );
}
