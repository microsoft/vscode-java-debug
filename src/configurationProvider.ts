// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import * as os from "os";
import * as vscode from "vscode";

import * as commands from "./commands";
import { logger, Type } from "./logger";
import * as utility from "./utility";

export class JavaDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    private isUserSettingsDirty: boolean = true;
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
            if (Object.keys(config).length === 0 && folder !== undefined) {
                return config;
            }
            // If it's the single file case that no workspace folder is opened, generate debug config in memory
            if (Object.keys(config).length === 0 && !folder) {
                config.type = "java";
                config.name = "Java Debug";
                config.request = "launch";
            }

            if (config.request === "launch") {
                try {
                    const buildResult = await vscode.commands.executeCommand(commands.JAVA_BUILD_WORKSPACE, false);
                } catch (err) {
                    const ans = await vscode.window.showErrorMessage("Build failed, do you want to continue?", "Proceed", "Abort");
                    if (ans !== "Proceed") {
                        return undefined;
                    }
                }

                const mainClassOption = await this.resolveLaunchConfig(folder ? folder.uri : undefined, config);
                if (!mainClassOption || !mainClassOption.mainClass) {
                    // Exit the debug session.
                    return;
                }

                config.mainClass = mainClassOption.mainClass;
                config.projectName = mainClassOption.projectName;

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
                    });
                    return undefined;
                }
            } else {
                const ans = await utility.showErrorMessageWithTroubleshooting({
                    message: `Request type "${config.request}" is not supported. Only "launch" and "attach" are supported.`,
                    type: Type.USAGEERROR,
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

    private async resolveLaunchConfig(folder: vscode.Uri | undefined, config: vscode.DebugConfiguration): Promise<IMainClassOption> {
        if (!config.mainClass) {
            return await this.promptMainClass(folder);
        }

        const validationResponse = await validateLaunchConfig(folder, config.mainClass, config.projectName);
        if (!validationResponse.mainClass.isValid || !validationResponse.projectName.isValid) {
            return await this.fixMainClass(folder, config, validationResponse);
        }

        return {
            mainClass: config.mainClass,
            projectName: config.projectName,
        };
    }

    private async fixMainClass(folder: vscode.Uri | undefined, config: vscode.DebugConfiguration, validationResponse: ILaunchValidationResponse):
        Promise<IMainClassOption | undefined> {
        const errors: string[] = [];
        if (!validationResponse.mainClass.isValid) {
            errors.push(String(validationResponse.mainClass.errorMessage));
        }

        if (!validationResponse.projectName.isValid) {
            errors.push(String(validationResponse.projectName.errorMessage));
        }

        if (validationResponse.proposals && validationResponse.proposals.length) {
            const answer = await utility.showErrorMessageWithTroubleshooting({
                message: errors.join(os.EOL),
                type: Type.USAGEERROR,
            }, "Fix");
            if (answer === "Fix") {
                const selectedFix: IMainClassOption = await this.showMainClassQuickPick(validationResponse.proposals,
                    "Please select main class<project name>", false);
                if (selectedFix) {
                    logger.log(Type.USAGEDATA, {
                        fix: "yes",
                        fixMessage: errors.join(os.EOL),
                    });
                    await this.persistMainClassOption(folder, config, selectedFix);
                }

                return selectedFix;
            }
        } else {
            utility.showErrorMessageWithTroubleshooting({
                message: errors.join(os.EOL),
                type: Type.USAGEERROR,
            });
        }

        return;
    }

    private async persistMainClassOption(folder: vscode.Uri | undefined, oldConfig: vscode.DebugConfiguration, change: IMainClassOption):
        Promise<void> {
        const newConfig: vscode.DebugConfiguration = _.cloneDeep(oldConfig);
        newConfig.mainClass = change.mainClass;
        newConfig.projectName = change.projectName;

        return this.persistLaunchConfig(folder, oldConfig, newConfig);
    }

    private async persistLaunchConfig(folder: vscode.Uri | undefined, oldConfig: vscode.DebugConfiguration, newConfig: vscode.DebugConfiguration):
        Promise<void> {
        const launchConfigurations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("launch", folder);
        const rawConfigs: vscode.DebugConfiguration[] = launchConfigurations.configurations;
        const targetIndex: number = _.findIndex(rawConfigs, (config) => _.isEqual(config, oldConfig));
        if (targetIndex >= 0) {
            rawConfigs[targetIndex] = newConfig;
            await launchConfigurations.update("configurations", rawConfigs);
        }
    }

    private async promptMainClass(folder: vscode.Uri | undefined): Promise<IMainClassOption | undefined> {
        const res = await resolveMainClass(folder);
        if (res.length === 0) {
            utility.showErrorMessageWithTroubleshooting({
                message: "Cannot find a class with the main method.",
                type: Type.USAGEERROR,
            });
            return undefined;
        }

        return await this.showMainClassQuickPick(res, "Select main class<project name>");
    }

    private async showMainClassQuickPick(candidates: IMainClassOption[], quickPickHintMessage: string, autoPick: boolean = true):
        Promise<IMainClassOption | undefined> {
        const pickItems = candidates.map((item) => {
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
        });

        if (pickItems.length === 0) {
            return;
        }

        const selection = (pickItems.length === 1 && autoPick) ?
            pickItems[0] : await vscode.window.showQuickPick(pickItems, { placeHolder: quickPickHintMessage });

        if (selection && selection.item) {
            return selection.item;
        } else {
            return undefined;
        }
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

function validateLaunchConfig(workspaceUri: vscode.Uri, mainClass, projectName): Promise<ILaunchValidationResponse> {
    return <Promise<ILaunchValidationResponse>> commands.executeJavaLanguageServerCommand(commands.JAVA_VALIDATE_LAUNCHCONFIG,
        workspaceUri ? workspaceUri.toString() : undefined, mainClass, projectName);
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
    readonly projectName?: string;
    readonly mainClass: string;
}

interface IValidationResult {
    readonly isValid: boolean;
    readonly errorMessage?: string;
}

interface ILaunchValidationResponse {
    readonly mainClass: IValidationResult;
    readonly projectName: IValidationResult;
    readonly proposals?: IMainClassOption[];
}
