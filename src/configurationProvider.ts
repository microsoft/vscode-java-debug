// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import * as commands from "./commands";

export class JavaDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    private isUserSettingsDirty: boolean = true;
    constructor(private _reporter: TelemetryReporter) {
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (vscode.debug.activeDebugSession) {
                this.isUserSettingsDirty = false;
                return updateDebugSettings();
            } else {
                this.isUserSettingsDirty = true;
            }
        });
    }

    // Returns an initial debug configurations based on contextual information.
    public provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken):
        vscode.ProviderResult<vscode.DebugConfiguration[]> {
        return <Thenable<vscode.DebugConfiguration[]>>this.provideDebugConfigurationsAsync(folder);
    }

    // Try to add all missing attributes to the debug configuration being launched.
    public resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken):
        vscode.ProviderResult<vscode.DebugConfiguration> {
        return this.heuristicallyResolveDebugConfiguration(folder, config);
    }

    private provideDebugConfigurationsAsync(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken) {
        return vscode.window.withProgress({location: vscode.ProgressLocation.Window}, (p) => {
            return new Promise((resolve, reject) => {
                p.report({message: "Auto generating configuration..."});
                resolveMainClass(folder.uri).then((res: any[]) => {
                    let cache;
                    cache = {};
                    const launchConfigs = res.map((item) => {
                        return {
                            type: "java",
                            name: this.constructLaunchConfigName(item.mainClass, item.projectName, cache),
                            request: "launch",
                            // tslint:disable-next-line
                            cwd: "${workspaceFolder}",
                            mainClass: item.mainClass,
                            projectName: item.projectName,
                            args: "",
                        };
                    });
                    resolve([...launchConfigs, {
                        type: "java",
                        name: "Debug (Attach)",
                        request: "attach",
                        hostName: "localhost",
                        port: 0,
                    }]);
                }, (ex) => {
                    p.report({message: `failed to generate configuration. ${ex}`});
                    reject(ex);
                });
            });
        });
    }

    private constructLaunchConfigName(mainClass: string, projectName: string, cache: {}) {
        const prefix = "Debug (Launch)-";
        let name = prefix + mainClass.substr(mainClass.lastIndexOf(".") + 1);
        if (projectName !== undefined) {
            name += `<${projectName}>`;
        }
        if (cache[name] === undefined) {
            cache[name] = 0;
            return name;
        } else {
            cache[name] += 1;
            return `${name}(${cache[name]})`;
        }
    }

    private async heuristicallyResolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration) {
        try {
            if (this.isUserSettingsDirty) {
                this.isUserSettingsDirty = false;
                await updateDebugSettings();
            }

            try {
                const buildResult = await vscode.commands.executeCommand(commands.JAVA_BUILD_WORKSPACE);
                console.log(buildResult);
            } catch (err) {
                vscode.window.showErrorMessage("Build failed, please fix build error first.");
                return config;
            }

            if (Object.keys(config).length === 0) { // No launch.json in current workspace.
                // check whether it is opened as a folder
                if (folder !== undefined) {
                    // for opened with folder, return directly.
                    return config;
                }
                // Generate config in memory for single file
                config.type = "java";
                config.name = "Java Debug";
                config.request = "launch";
            }

            // Workaround bug https://github.com/Microsoft/vscode-java-debug/issues/145
            config.stopOnEntry = false;

            if (config.request === "launch") {
                if (!config.mainClass) {
                    const res = <any[]>(await resolveMainClass(folder.uri));
                    if (res.length === 0) {
                        vscode.window.showErrorMessage(
                            "Cannot resolve main class automatically, please specify the mainClass " +
                            "(e.g. [mymodule/]com.xyz.MainClass) in the launch.json.");
                        return;
                    }
                    const pickItems = res.map((item) => {
                        let name = item.mainClass;
                        let details = `main class: ${item.mainClass}`;
                        if (item.projectName !== undefined) {
                            name += `<${item.projectName}>`;
                            details += ` | project name: ${item.projectName}`;
                        }
                        return {
                            description: details,
                            label: name,
                            item,
                        };
                    }).sort ((a, b): number => {
                        return a.label > b.label ? 1 : -1;
                    });
                    const selection = await vscode.window.showQuickPick(pickItems, { placeHolder: "Select main class<project name>" });
                    if (selection) {
                        config.mainClass = selection.item.mainClass;
                        config.projectName = selection.item.projectName;
                    } else {
                        vscode.window.showErrorMessage("Please specify the mainClass (e.g. [mymodule/]com.xyz.MainClass) in the launch.json.");
                        this.log("usageError", "Please specify the mainClass (e.g. [mymodule/]com.xyz.MainClass) in the launch.json.");
                        return undefined;
                    }
                }
                if (this.isEmptyArray(config.classPaths) && this.isEmptyArray(config.modulePaths)) {
                    const result = <any[]>(await resolveClasspath(config.mainClass, config.projectName));
                    config.modulePaths = result[0];
                    config.classPaths = result[1];
                    config.projectName = result[2] ? result[2][0] : undefined;
                }
                if (this.isEmptyArray(config.classPaths) && this.isEmptyArray(config.modulePaths)) {
                    const hintMessage = "Cannot resolve the modulepaths/classpaths automatically, please specify the value in the launch.json.";
                    vscode.window.showErrorMessage(hintMessage);
                    this.log("usageError", hintMessage);
                    return undefined;
                }
            } else if (config.request === "attach") {
                if (!config.hostName || !config.port) {
                    vscode.window.showErrorMessage("Please specify the host name and the port of the remote debuggee in the launch.json.");
                    this.log("usageError", "Please specify the host name and the port of the remote debuggee in the launch.json.");
                    return undefined;
                }
            } else {
                const ans = await vscode.window.showErrorMessage(
                    // tslint:disable-next-line:max-line-length
                    "Request type \"" + config.request + "\" is not supported. Only \"launch\" and \"attach\" are supported.", "Open launch.json");
                if (ans === "Open launch.json") {
                    await vscode.commands.executeCommand(commands.VSCODE_ADD_DEBUGCONFIGURATION);
                }
                this.log("usageError", "Illegal request type in launch.json");
                return undefined;
            }
            const debugServerPort = await startDebugSession();
            if (debugServerPort) {
                config.debugServer = debugServerPort;
                return config;
            } else {
                this.log("exception", "Failed to start debug server.");
                // Information for diagnostic:
                console.log("Cannot find a port for debugging session");
                return undefined;
            }
        } catch (ex) {
            const errorMessage = (ex && ex.message) || ex;
            vscode.window.showErrorMessage(String(errorMessage));
            if (this._reporter) {
                const exception = (ex && ex.data && ex.data.cause)
                    || { stackTrace: [], detailMessage: String((ex && ex.message) || ex || "Unknown exception") };
                const properties = {
                    message: "",
                    stackTrace: "",
                };
                if (exception && typeof exception === "object") {
                    properties.message = exception.detailMessage;
                    properties.stackTrace = (Array.isArray(exception.stackTrace) && JSON.stringify(exception.stackTrace))
                        || String(exception.stackTrace);
                } else {
                    properties.message = String(exception);
                }
                this._reporter.sendTelemetryEvent("exception", properties);
            }
            return undefined;
        }
    }

    private log(type: string, message: string) {
        if (this._reporter) {
            this._reporter.sendTelemetryEvent(type, { message });
        }
    }

    private isEmptyArray(configItems: any): boolean {
        return !Array.isArray(configItems) || !configItems.length;
    }
}

function startDebugSession() {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_START_DEBUGSESSION);
}

function resolveClasspath(mainClass, projectName) {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_CLASSPATH, mainClass, projectName);
}

function resolveMainClass(workspaceUri: vscode.Uri) {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINCLASS, workspaceUri.toString());
}

async function updateDebugSettings() {
    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug");
    if (!debugSettingsRoot) {
        return;
    }
    const logLevel = convertLogLevel(debugSettingsRoot.logLevel || "");
    if (debugSettingsRoot.settings && Object.keys(debugSettingsRoot.settings).length) {
        try {
            console.log("settings:", await commands.executeJavaLanguageServerCommand(commands.JAVA_UPDATE_DEBUG_SETTINGS, JSON.stringify(
                { ...debugSettingsRoot.settings, logLevel })));
        } catch (err) {
            // log a warning message and continue, since update settings failure should not block debug session
            console.log("Cannot update debug settings.", err)
        }
    }
}

function convertLogLevel(commonLogLevel: string) {
    // convert common log level to java log level
    switch (commonLogLevel.toLowerCase()) {
        case "verbose":
            return "FINE";
        case "warn":
            return "WARNING";
        case "error":
            return "SEVERE";
        case "info":
            return "INFO";
        default:
            return "FINE";
    }
}
