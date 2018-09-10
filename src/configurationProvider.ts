// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as _ from "lodash";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import * as anchor from "./anchor";
import * as commands from "./commands";
import { logger, Type } from "./logger";
import * as utility from "./utility";
import { VariableResolver } from "./variableResoler";

export class JavaDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    private isUserSettingsDirty: boolean = true;
    private debugHistory: MostRecentlyUsedHistory = new MostRecentlyUsedHistory();

    constructor(private resolver: VariableResolver) {
        this.resolver = new VariableResolver();
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
        this.resolveVariables(folder, config);
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

    private resolveVariables(folder: vscode.WorkspaceFolder, config: vscode.DebugConfiguration): void {
        // all the properties whose values are string or array of string
        const keys =  ["mainClass", "args", "vmArgs", "modulePaths", "classPaths", "projectName",
            "env", "sourcePaths", "encoding",  "cwd",  "hostName"];
        if (!config) {
            return;
        }
        for (const key of keys) {
            if (config.hasOwnProperty(key)) {
                const value = config[key];
                if (_.isString(value)) {
                    config[key] = this.resolver.resolveString(folder.uri, value);
                } else if (_.isArray(value)) {
                    config[key] = _.map(value, (item) =>
                        _.isString(item) ? this.resolver.resolveString(folder.uri, item) : item);
                }
            }
        }
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
            if (this.isEmptyConfig(config) && folder !== undefined) {
                return config;
            }
            // If it's the single file case that no workspace folder is opened, generate debug config in memory
            if (this.isEmptyConfig(config) && !folder) {
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

                const mainClassOption = await this.resolveLaunchConfig(folder ? folder.uri : undefined, config);
                if (!mainClassOption || !mainClassOption.mainClass) { // Exit silently if the user cancels the prompt fix by ESC.
                    // Exit the debug session.
                    return;
                }

                config.mainClass = mainClassOption.mainClass;
                config.projectName = mainClassOption.projectName;

                if (_.isEmpty(config.classPaths) && _.isEmpty(config.modulePaths)) {
                    const result = <any[]>(await resolveClasspath(config.mainClass, config.projectName));
                    config.modulePaths = result[0];
                    config.classPaths = result[1];
                }
                if (_.isEmpty(config.classPaths) && _.isEmpty(config.modulePaths)) {
                    throw new utility.UserError({
                        message: "Cannot resolve the modulepaths/classpaths automatically, please specify the value in the launch.json.",
                        type: Type.USAGEERROR,
                    });
                }
            } else if (config.request === "attach") {
                if (!config.hostName || !config.port) {
                    throw new utility.UserError({
                        message: "Please specify the host name and the port of the remote debuggee in the launch.json.",
                        type: Type.USAGEERROR,
                        anchor: anchor.ATTACH_CONFIG_ERROR,
                    });
                }
            } else {
                throw new utility.UserError({
                    message: `Request type "${config.request}" is not supported. Only "launch" and "attach" are supported.`,
                    type: Type.USAGEERROR,
                    anchor: anchor.REQUEST_TYPE_NOT_SUPPORTED,
                });
            }

            if (Array.isArray(config.args)) {
                config.args = this.concatArgs(config.args);
            }

            if (Array.isArray(config.vmArgs)) {
                config.vmArgs = this.concatArgs(config.vmArgs);
            }

            const debugServerPort = await startDebugSession();
            if (debugServerPort) {
                config.debugServer = debugServerPort;
                return config;
            } else {
                // Information for diagnostic:
                console.log("Cannot find a port for debugging session");
                throw new Error("Failed to start debug server.");
            }
        } catch (ex) {
            if (ex instanceof utility.UserError) {
                utility.showErrorMessageWithTroubleshooting(ex.context);
                return undefined;
            }

            const errorMessage = (ex && ex.message) || ex;
            const exception = (ex && ex.data && ex.data.cause)
                || { stackTrace: (ex && ex.stack), detailMessage: String((ex && ex.message) || ex || "Unknown exception") };
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

    /**
     * Converts an array of arguments to a string as the args and vmArgs.
     */
    private concatArgs(args: any[]): string {
        return _.join(_.map(args, (arg: any): string  => {
            const str = String(arg);
            // if it has quotes or spaces, use double quotes to wrap it
            if (/['"\s]/.test(str)) {
                return "\"" + str.replace(/(['"\\])/g, "\\$1") + "\"";
            }
            return str;

            // if it has only single quotes
        }), " ");
    }

    /**
     * When VS Code cannot find any available DebugConfiguration, it passes a { noDebug?: boolean } to resolve.
     * This function judges whether a DebugConfiguration is empty by filtering out the field "noDebug".
     */
    private isEmptyConfig(config: vscode.DebugConfiguration): boolean {
        return Object.keys(config).filter((key: string) => key !== "noDebug").length === 0;
    }

    private async resolveLaunchConfig(folder: vscode.Uri | undefined, config: vscode.DebugConfiguration): Promise<IMainClassOption> {
        if (!config.mainClass) {
            return await this.promptMainClass(folder);
        }

        const containsExternalClasspaths = !_.isEmpty(config.classPaths) || !_.isEmpty(config.modulePaths);
        const validationResponse = await validateLaunchConfig(folder, config.mainClass, config.projectName, containsExternalClasspaths);
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
            errors.push(String(validationResponse.mainClass.message));
        }

        if (!validationResponse.projectName.isValid) {
            errors.push(String(validationResponse.projectName.message));
        }

        if (validationResponse.proposals && validationResponse.proposals.length) {
            const answer = await utility.showErrorMessageWithTroubleshooting({
                message: errors.join(os.EOL),
                type: Type.USAGEERROR,
                anchor: anchor.FAILED_TO_RESOLVE_CLASSPATH,
            }, "Fix");
            if (answer === "Fix") {
                const pickItems: IMainClassQuickPickItem[] = this.formatMainClassOptions(validationResponse.proposals);
                const selectedFix: IMainClassOption = await this.showMainClassQuickPick(pickItems, "Please select main class<project name>", false);
                if (selectedFix) {
                    logger.log(Type.USAGEDATA, {
                        fix: "yes",
                        fixMessage: errors.join(os.EOL),
                    });
                    await this.persistMainClassOption(folder, config, selectedFix);
                }

                return selectedFix;
            }
            // return undefined if the user clicks "Learn More".
            return;
        }

        throw new utility.UserError({
            message: errors.join(os.EOL),
            type: Type.USAGEERROR,
            anchor: anchor.FAILED_TO_RESOLVE_CLASSPATH,
        });
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
            throw new utility.UserError({
                message: "Cannot find a class with the main method.",
                type: Type.USAGEERROR,
                anchor: anchor.CANNOT_FIND_MAIN_CLASS,
            });
        }

        const pickItems: IMainClassQuickPickItem[] = this.formatRecentlyUsedMainClassOptions(res);
        const selected = await this.showMainClassQuickPick(pickItems, "Select main class<project name>");
        if (selected) {
            this.debugHistory.updateMRUTimestamp(selected);
        }

        return selected;
    }

    private async showMainClassQuickPick(pickItems: IMainClassQuickPickItem[], quickPickHintMessage: string, autoPick: boolean = true):
        Promise<IMainClassOption | undefined> {
        // return undefined when the user cancels QuickPick by pressing ESC.
        const selected = (pickItems.length === 1 && autoPick) ?
            pickItems[0] : await vscode.window.showQuickPick(pickItems, { placeHolder: quickPickHintMessage });

        return selected && selected.item;
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

function validateLaunchConfig(workspaceUri: vscode.Uri, mainClass: string, projectName: string, containsExternalClasspaths: boolean):
    Promise<ILaunchValidationResponse> {
    return <Promise<ILaunchValidationResponse>> commands.executeJavaLanguageServerCommand(commands.JAVA_VALIDATE_LAUNCHCONFIG,
        workspaceUri ? workspaceUri.toString() : undefined, mainClass, projectName, containsExternalClasspaths);
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

interface IValidationResult {
    readonly isValid: boolean;
    readonly message?: string;
}

interface ILaunchValidationResponse {
    readonly mainClass: IValidationResult;
    readonly projectName: IValidationResult;
    readonly proposals?: IMainClassOption[];
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
