// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as path from "path";
import * as vscode from "vscode";

import * as anchor from "./anchor";
import * as commands from "./commands";
import { logger, Type } from "./logger";
import * as utility from "./utility";

export class JavaDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    private isUserSettingsDirty: boolean = true;
    private debugHistory: MostRecentlyUsedHistory = new MostRecentlyUsedHistory();

    constructor() {
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
                resolveMainClass(folder ? folder.uri : undefined).then((res: IMainClassOption[]) => {
                    let cache;
                    cache = {};
                    const defaultLaunchConfig = {
                        type: "java",
                        name: "Debug (Launch)",
                        request: "launch",
                        // tslint:disable-next-line
                        cwd: "${workspaceFolder}",
                        console: "internalConsole",
                        stopOnEntry: false,
                        mainClass: "",
                        args: "",
                    };
                    const launchConfigs = res.map((item) => {
                        return {
                            ...defaultLaunchConfig,
                            name: this.constructLaunchConfigName(item.mainClass, item.projectName, cache),
                            mainClass: item.mainClass,
                            projectName: item.projectName,
                        };
                    });
                    const defaultAttachConfig = {
                        type: "java",
                        name: "Debug (Attach)",
                        request: "attach",
                        hostName: "localhost",
                        port: "<debug port of remote debuggee>",
                    };
                    resolve([defaultLaunchConfig, ...launchConfigs, defaultAttachConfig]);
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

            /**
             * If no launch.json exists in the current workspace folder
             * delegate to provideDebugConfigurations api to generate the initial launch.json configurations
             */
            if (this.isValidConfig(config) && folder !== undefined) {
                return config;
            }
            // If it's the single file case that no workspace folder is opened, generate debug config in memory
            if (this.isValidConfig(config) && !folder) {
                config.type = "java";
                config.name = "Java Debug";
                config.request = "launch";
            }

            if (config.request === "launch") {
                try {
                    const buildResult = await vscode.commands.executeCommand(commands.JAVA_BUILD_WORKSPACE, false);
                } catch (err) {
                    const ans = await utility.showErrorMessageWithTroubleshooting({
                        message: "Build failed, do you want to continue?",
                        type: Type.USAGEERROR,
                        anchor: anchor.BUILD_FAILED,
                    }, "Proceed", "Abort");
                    if (ans !== "Proceed") {
                        return undefined;
                    }
                }
                if (!config.mainClass) {
                    const userSelection = await this.chooseMainClass(folder);
                    if (!userSelection || !userSelection.mainClass) {
                        // the error is handled inside chooseMainClass
                        return;
                    }
                    config.mainClass = userSelection.mainClass;
                    config.projectName = userSelection.projectName;
                }
                if (this.isEmptyArray(config.classPaths) && this.isEmptyArray(config.modulePaths)) {
                    const result = <any[]>(await resolveClasspath(config.mainClass, config.projectName));
                    config.modulePaths = result[0];
                    config.classPaths = result[1];
                }
                if (this.isEmptyArray(config.classPaths) && this.isEmptyArray(config.modulePaths)) {
                    utility.showErrorMessageWithTroubleshooting({
                        message: "Cannot resolve the modulepaths/classpaths automatically, please specify the value in the launch.json.",
                        type: Type.USAGEERROR,
                    });
                    return undefined;
                }
            } else if (config.request === "attach") {
                if (!config.hostName || !config.port) {
                    utility.showErrorMessageWithTroubleshooting({
                        message: "Please specify the host name and the port of the remote debuggee in the launch.json.",
                        type: Type.USAGEERROR,
                        anchor: anchor.ATTACH_CONFIG_ERROR,
                    });
                    return undefined;
                }
            } else {
                const ans = await utility.showErrorMessageWithTroubleshooting({
                    message: `Request type "${config.request}" is not supported. Only "launch" and "attach" are supported.`,
                    type: Type.USAGEERROR,
                    anchor: anchor.REQUEST_TYPE_NOT_SUPPORTED,
                }, "Open launch.json");
                if (ans === "Open launch.json") {
                    await vscode.commands.executeCommand(commands.VSCODE_ADD_DEBUGCONFIGURATION);
                }
                return undefined;
            }
            const debugServerPort = await startDebugSession();
            if (debugServerPort) {
                config.debugServer = debugServerPort;
                return config;
            } else {
                logger.logMessage(Type.EXCEPTION, "Failed to start debug server.");
                // Information for diagnostic:
                console.log("Cannot find a port for debugging session");
                return undefined;
            }
        } catch (ex) {
            const errorMessage = (ex && ex.message) || ex;
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
            utility.showErrorMessageWithTroubleshooting({
                message: String(errorMessage),
                type: Type.EXCEPTION,
                details: properties,
            });
            return undefined;
        }
    }

    private isEmptyArray(configItems: any): boolean {
        return !Array.isArray(configItems) || !configItems.length;
    }

    private isValidConfig(config: vscode.DebugConfiguration): boolean {
        // filter out the auto filled field "noDebug"
        return Object.keys(config).filter((key: string) => key !== "noDebug").length === 0;
    }

    private async chooseMainClass(folder: vscode.WorkspaceFolder | undefined): Promise<IMainClassOption | undefined> {
        const res = await resolveMainClass(folder ? folder.uri : undefined);
        if (res.length === 0) {
            utility.showErrorMessageWithTroubleshooting({
                message: "Cannot find a class with the main method.",
                type: Type.USAGEERROR,
                anchor: anchor.CANNOT_FIND_MAIN_CLASS,
            });
            return undefined;
        }

        const pickItems: IMainClassQuickPickItem[] = this.formatRecentlyUsedMainClassOptions(res);

        const selection = pickItems.length > 1 ?
            await vscode.window.showQuickPick(pickItems, { placeHolder: "Select main class<project name>" })
            : pickItems[0];

        if (selection && selection.item) {
            this.debugHistory.updateMRUTimestamp(selection.item);
            return selection.item;
        } else {
            return undefined;
        }
    }

    private isOpenedInActiveEditor(file: string): boolean {
        const activeEditor: vscode.TextEditor = vscode.window.activeTextEditor;
        const currentActiveFile: string = activeEditor ? activeEditor.document.uri.fsPath : undefined;

        return file && currentActiveFile && path.relative(file, currentActiveFile) === "";
    }

    private formatRecentlyUsedMainClassOptions(options: IMainClassOption[]): IMainClassQuickPickItem[] {
        // Sort the Main Class options with the recently used timestamp.
        options.sort((a: IMainClassOption, b: IMainClassOption) => {
            return this.debugHistory.getMRUTimestamp(b) - this.debugHistory.getMRUTimestamp(a);
        });

        // Move the Main Class from Active Editor to the top.
        // If it's not the most recently used one, then put it as the second.
        let positionForActiveEditor = options.findIndex((value: IMainClassOption) => {
            return this.isOpenedInActiveEditor(value.filePath);
        });
        if (positionForActiveEditor >= 1) {
            let newPosition = 0;
            if (this.debugHistory.contains(options[0])) {
                newPosition = 1;
            }

            if (newPosition !== positionForActiveEditor) {
                const update: IMainClassOption[] = options.splice(positionForActiveEditor, 1);
                options.splice(newPosition, 0, ...update);
                positionForActiveEditor = newPosition;
            }
        }

        const pickItems: IMainClassQuickPickItem[] = this.formatMainClassOptions(options);

        if (this.debugHistory.contains(options[0])) {
            pickItems[0].detail = "$(clock) recently used";
        }

        if (positionForActiveEditor >= 0) {
            if (pickItems[positionForActiveEditor].detail) {
                pickItems[positionForActiveEditor].detail += `, active editor (${path.basename(options[positionForActiveEditor].filePath)})`;
            } else {
                pickItems[positionForActiveEditor].detail = `$(clock) active editor (${path.basename(options[positionForActiveEditor].filePath)})`;
            }
        }

        return pickItems;
    }

    private formatMainClassOptions(options: IMainClassOption[]): IMainClassQuickPickItem[] {
        return options.map((item) => {
            let label = item.mainClass;
            let description = `main class: ${item.mainClass}`;
            if (item.projectName) {
                label += `<${item.projectName}>`;
                description += ` | project name: ${item.projectName}`;
            }

            return {
                label,
                description,
                detail: null,
                item,
            };
        });
    }
}

function startDebugSession() {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_START_DEBUGSESSION);
}

function resolveClasspath(mainClass, projectName) {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_CLASSPATH, mainClass, projectName);
}

function resolveMainClass(workspaceUri: vscode.Uri): Promise<IMainClassOption[]> {
    if (workspaceUri) {
        return <Promise<IMainClassOption[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINCLASS, workspaceUri.toString());
    }
    return <Promise<IMainClassOption[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINCLASS);
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

interface IMainClassOption {
    readonly mainClass: string;
    readonly projectName?: string;
    readonly filePath?: string;
}

interface IMainClassQuickPickItem extends vscode.QuickPickItem {
    item: IMainClassOption;
}

class MostRecentlyUsedHistory {
    private cache: { [key: string]: number } = {};

    public getMRUTimestamp(mainClassOption: IMainClassOption): number {
        return this.cache[this.getKey(mainClassOption)] || 0;
    }

    public updateMRUTimestamp(mainClassOption: IMainClassOption): void {
        this.cache[this.getKey(mainClassOption)] = Date.now();
    }

    public contains(mainClassOption: IMainClassOption): boolean {
        return Boolean(this.cache[this.getKey(mainClassOption)]);
    }

    private getKey(mainClassOption: IMainClassOption): string {
        return mainClassOption.mainClass + "|" + mainClassOption.projectName;
    }
}
