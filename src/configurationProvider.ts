// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as fs from "fs";
import * as _ from "lodash";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import * as dotenv from 'dotenv'

import { instrumentOperation, sendError, sendInfo, setUserError } from "vscode-extension-telemetry-wrapper";
import * as anchor from "./anchor";
import { buildWorkspace } from "./build";
import { populateStepFilters, substituteFilterVariables } from "./classFilter";
import * as commands from "./commands";
import { ClasspathVariable } from "./constants";
import { Type } from "./javaLogger";
import * as lsPlugin from "./languageServerPlugin";
import { addMoreHelpfulVMArgs, getJavaVersion, getShortenApproachForCLI, validateRuntimeCompatibility } from "./launchCommand";
import { mainClassPicker } from "./mainClassPicker";
import { resolveJavaProcess } from "./processPicker";
import { IProgressReporter } from "./progressAPI";
import { progressProvider } from "./progressImpl";
import * as utility from "./utility";

const platformNameMappings: { [key: string]: string } = {
    win32: "windows",
    linux: "linux",
    darwin: "osx",
};
const platformName = platformNameMappings[process.platform];

export class JavaDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    private isUserSettingsDirty: boolean = true;
    constructor() {
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("java.debug")) {
                if (vscode.debug.activeDebugSession) {
                    this.isUserSettingsDirty = false;
                    return updateDebugSettings(event);
                } else {
                    this.isUserSettingsDirty = true;
                }
            }
            return undefined;
        });
    }

    // Returns an initial debug configurations based on contextual information.
    public provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken):
        vscode.ProviderResult<vscode.DebugConfiguration[]> {
        const provideDebugConfigurationsHandler = instrumentOperation("provideDebugConfigurations", (_operationId: string) => {
            return <Thenable<vscode.DebugConfiguration[]>>this.provideDebugConfigurationsAsync(folder, token);
        });
        return provideDebugConfigurationsHandler();
    }

    // Try to add all missing attributes to the debug configuration being launched.
    public resolveDebugConfiguration(_folder: vscode.WorkspaceFolder | undefined,
                                     config: vscode.DebugConfiguration, _token?: vscode.CancellationToken):
        vscode.ProviderResult<vscode.DebugConfiguration> {
        // If no debug configuration is provided, then generate one in memory.
        if (this.isEmptyConfig(config)) {
            config.type = "java";
            config.name = "Java Debug";
            config.request = "launch";
        }

        return config;
    }

    // Try to add all missing attributes to the debug configuration being launched.
    public resolveDebugConfigurationWithSubstitutedVariables(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
        const resolveDebugConfigurationHandler = instrumentOperation("resolveDebugConfiguration", (_operationId: string) => {
            try {
                // See https://github.com/microsoft/vscode-java-debug/issues/778
                // Merge the platform specific properties to the global config to simplify the subsequent resolving logic.
                this.mergePlatformProperties(config, folder);
                return this.resolveAndValidateDebugConfiguration(folder, config, token);
            } catch (ex) {
                utility.showErrorMessage({
                    type: Type.EXCEPTION,
                    message: String((ex && ex.message) || ex),
                });
                return undefined;
            }
        });
        return resolveDebugConfigurationHandler();
    }

    private provideDebugConfigurationsAsync(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken) {
        return new Promise(async (resolve, _reject) => {
            const progressReporter = progressProvider.createProgressReporter("Create launch.json", vscode.ProgressLocation.Window);
            progressReporter.observe(token);
            const defaultLaunchConfig = {
                type: "java",
                name: "Launch Current File",
                request: "launch",
                // tslint:disable-next-line
                mainClass: "${file}",
            };
            try {
                const isOnStandardMode = await utility.waitForStandardMode(progressReporter);
                if (!isOnStandardMode) {
                    resolve([defaultLaunchConfig]);
                    return;
                }

                if (progressReporter.isCancelled()) {
                    resolve([defaultLaunchConfig]);
                    return;
                }
                progressReporter.report("Generating Java configuration...");
                const mainClasses = await lsPlugin.resolveMainClass(folder ? folder.uri : undefined);
                const cache = {};
                const launchConfigs = mainClasses.map((item) => {
                    return {
                        ...defaultLaunchConfig,
                        name: this.constructLaunchConfigName(item.mainClass, cache),
                        mainClass: item.mainClass,
                        projectName: item.projectName,
                    };
                });
                if (progressReporter.isCancelled()) {
                    resolve([defaultLaunchConfig]);
                    return;
                }
                resolve([defaultLaunchConfig, ...launchConfigs]);
            } catch (ex) {
                if (ex instanceof utility.JavaExtensionNotEnabledError) {
                    utility.guideToInstallJavaExtension();
                } else {
                    // tslint:disable-next-line
                    console.error(ex);
                }

                resolve([defaultLaunchConfig]);
            } finally {
                progressReporter.done();
            }
        });
    }

    private mergePlatformProperties(config: vscode.DebugConfiguration, _folder?: vscode.WorkspaceFolder) {
        if (config && platformName && config[platformName]) {
            try {
                for (const key of Object.keys(config[platformName])) {
                    config[key] = config[platformName][key];
                }
                config[platformName] = undefined;
            } catch {
                // do nothing
            }
        }
    }

    private constructLaunchConfigName(mainClass: string, cache: { [key: string]: any }) {
        const name = `Launch ${mainClass.substr(mainClass.lastIndexOf(".") + 1)}`;
        if (cache[name] === undefined) {
            cache[name] = 0;
            return name;
        } else {
            cache[name] += 1;
            return `${name}(${cache[name]})`;
        }
    }

    private mergeEnvFile(config: vscode.DebugConfiguration) {
        const baseEnv = config.env || {};
        let result = baseEnv;
        if (config.envFile) {
            try {
                result = {
                    ...baseEnv,
                    ...readEnvFile(config.envFile),
                };
            } catch (e) {
                throw new utility.UserError({
                    message: "Cannot load environment file.",
                    type: Type.USAGEERROR,
                });
            }
        }
        config.env = result;
    }

    private async resolveAndValidateDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration,
                                                       token?: vscode.CancellationToken) {
        let progressReporter = progressProvider.getProgressReporter(config.__progressId);
        if (!progressReporter && config.__progressId) {
            return undefined;
        } else if (!progressReporter) {
            progressReporter = progressProvider.createProgressReporter(config.noDebug ? "Run" : "Debug");
        }

        progressReporter.observe(token);
        if (progressReporter.isCancelled()) {
            return undefined;
        }

        try {
            const isOnStandardMode = await utility.waitForStandardMode(progressReporter);
            if (!isOnStandardMode || progressReporter.isCancelled()) {
                return undefined;
            }

            if (this.isUserSettingsDirty) {
                this.isUserSettingsDirty = false;
                await updateDebugSettings();
            }

            // If no debug configuration is provided, then generate one in memory.
            if (this.isEmptyConfig(config)) {
                config.type = "java";
                config.name = "Java Debug";
                config.request = "launch";
            }

            if (config.request === "launch") {
                this.mergeEnvFile(config);

                // If the user doesn't specify 'vmArgs' in launch.json, use the global setting to get the default vmArgs.
                if (config.vmArgs === undefined) {
                    const debugSettings: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
                    config.vmArgs = debugSettings.vmArgs;
                }
                // If the user doesn't specify 'console' in launch.json, use the global setting to get the launch console.
                if (!config.console) {
                    const debugSettings: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
                    config.console = debugSettings.console;
                }
                // If the console is integratedTerminal, don't auto switch the focus to DEBUG CONSOLE.
                if (config.console === "integratedTerminal" && !config.internalConsoleOptions) {
                    config.internalConsoleOptions = "neverOpen";
                }

                if (needsBuildWorkspace()) {
                    progressReporter.report("Compiling...");
                    const proceed = await buildWorkspace(progressReporter);
                    if (!proceed) {
                        return undefined;
                    }
                }

                if (progressReporter.isCancelled()) {
                    return undefined;
                }
                if (!config.mainClass) {
                    progressReporter.report("Resolving main class...");
                } else {
                    progressReporter.report("Resolving launch configuration...");
                }
                const mainClassOption = await this.resolveAndValidateMainClass(folder && folder.uri, config, progressReporter);
                if (!mainClassOption || !mainClassOption.mainClass) { // Exit silently if the user cancels the prompt fix by ESC.
                    // Exit the debug session.
                    return undefined;
                }

                progressReporter.report("Resolving launch configuration...");
                config.mainClass = mainClassOption.mainClass;
                config.projectName = mainClassOption.projectName;

                if (progressReporter.isCancelled()) {
                    return undefined;
                }

                if (_.isEmpty(config.classPaths) && _.isEmpty(config.modulePaths)) {
                    const result = <any[]>(await lsPlugin.resolveClasspath(config.mainClass, config.projectName));
                    config.modulePaths = result[0];
                    config.classPaths = result[1];
                } else {
                    config.modulePaths = await this.resolvePath(folder, config.modulePaths, config.mainClass,
                        config.projectName, true /*isModulePath*/);
                    config.classPaths = await this.resolvePath(folder, config.classPaths, config.mainClass,
                        config.projectName, false /*isModulePath*/);
                }
                if (_.isEmpty(config.classPaths) && _.isEmpty(config.modulePaths)) {
                    throw new utility.UserError({
                        message: "Cannot resolve the modulepaths/classpaths automatically, please specify the value in the launch.json.",
                        type: Type.USAGEERROR,
                    });
                }

                config.javaExec = await lsPlugin.resolveJavaExecutable(config.mainClass, config.projectName);
                // Add the default launch options to the config.
                config.cwd = config.cwd || _.get(folder, "uri.fsPath");
                if (Array.isArray(config.args)) {
                    config.args = this.concatArgs(config.args);
                }

                if (Array.isArray(config.vmArgs)) {
                    config.vmArgs = this.concatArgs(config.vmArgs);
                }

                if (progressReporter.isCancelled()) {
                    return undefined;
                }
                // Populate the class filters to the debug configuration.
                await populateStepFilters(config);

                const targetJavaVersion: number = await getJavaVersion(config.javaExec);
                // Auto add '--enable-preview' vmArgs if the java project enables COMPILER_PB_ENABLE_PREVIEW_FEATURES flag.
                if (await lsPlugin.detectPreviewFlag(config.mainClass, config.projectName)) {
                    config.vmArgs = (config.vmArgs || "") + " --enable-preview";
                    validateRuntimeCompatibility(targetJavaVersion);
                }

                // Add more helpful vmArgs.
                await addMoreHelpfulVMArgs(config, targetJavaVersion);

                if (!config.shortenCommandLine || config.shortenCommandLine === "auto") {
                    config.shortenCommandLine = await getShortenApproachForCLI(config, targetJavaVersion);
                }

                if (process.platform === "win32" && config.console !== "internalConsole") {
                    const launcherScript: string = utility.getLauncherScriptPath();
                    if (!launcherScript.includes(" ") || !utility.isGitBash(config.console === "integratedTerminal")) {
                        config.launcherScript = launcherScript;
                    }
                }
            } else if (config.request === "attach") {
                if (config.hostName && config.port && Number.isInteger(Number(config.port))) {
                    config.port = Number(config.port);
                    config.processId = undefined;
                    // Continue if the hostName and port are configured.
                } else if (config.processId !== undefined) {
                    // tslint:disable-next-line
                    if (config.processId === "${command:PickJavaProcess}") {
                        return undefined;
                    }

                    const pid: number = Number(config.processId);
                    if (Number.isNaN(pid)) {
                        vscode.window.showErrorMessage(`The processId config '${config.processId}' is not a valid process id.`);
                        return undefined;
                    }

                    const javaProcess = await resolveJavaProcess(pid);
                    if (!javaProcess) {
                        vscode.window.showErrorMessage(`Attach to process: pid '${config.processId}' is not a debuggable Java process. `
                            + `Please make sure the process has turned on debug mode using vmArgs like `
                            + `'-agentlib:jdwp=transport=dt_socket,server=y,address=5005.'`);
                        return undefined;
                    }

                    config.processId = undefined;
                    config.hostName = javaProcess.hostName;
                    config.port = javaProcess.debugPort;
                } else {
                    throw new utility.UserError({
                        message: "Please specify the hostName/port directly, or provide the processId of the remote debuggee in the launch.json.",
                        type: Type.USAGEERROR,
                        anchor: anchor.ATTACH_CONFIG_ERROR,
                    });
                }

                // Populate the class filters to the debug configuration.
                await populateStepFilters(config);
            } else {
                throw new utility.UserError({
                    message: `Request type "${config.request}" is not supported. Only "launch" and "attach" are supported.`,
                    type: Type.USAGEERROR,
                    anchor: anchor.REQUEST_TYPE_NOT_SUPPORTED,
                });
            }

            if (token?.isCancellationRequested || progressReporter.isCancelled()) {
                return undefined;
            }

            delete config.__progressId;
            return config;
        } catch (ex) {
            if (ex instanceof utility.JavaExtensionNotEnabledError) {
                utility.guideToInstallJavaExtension();
                return undefined;
            }
            if (ex instanceof utility.UserError) {
                utility.showErrorMessageWithTroubleshooting(ex.context);
                return undefined;
            }

            utility.showErrorMessageWithTroubleshooting(utility.convertErrorToMessage(ex));
            return undefined;
        } finally {
            progressReporter.done();
        }
    }

    private async resolvePath(folder: vscode.WorkspaceFolder | undefined, pathArray: string[], mainClass: string,
                              projectName: string, isModulePath: boolean): Promise<string[]> {
        if (_.isEmpty(pathArray)) {
            return [];
        }

        const pathVariables: string[] = [ClasspathVariable.Auto, ClasspathVariable.Runtime, ClasspathVariable.Test];
        const containedVariables: string[] = pathArray.filter((cp: string) => pathVariables.includes(cp));
        if (_.isEmpty(containedVariables)) {
            return this.filterExcluded(folder, pathArray);
        }

        const scope: string | undefined = this.mergeScope(containedVariables);
        const response: any[] = <any[]> await lsPlugin.resolveClasspath(mainClass, projectName, scope);
        const resolvedPaths: string[] = isModulePath ? response?.[0] : response?.[1];
        if (!resolvedPaths) {
            // tslint:disable-next-line:no-console
            console.log("The Java Language Server failed to resolve the classpaths/modulepaths");
        }
        const paths: string[] = [];
        let replaced: boolean = false;
        for (const p of pathArray) {
            if (pathVariables.includes(p)) {
                if (!replaced) {
                    paths.push(...resolvedPaths);
                    replaced = true;
                }
                continue;
            }
            paths.push(p);
        }
        return this.filterExcluded(folder, paths);
    }

    private async filterExcluded(folder: vscode.WorkspaceFolder | undefined, paths: string[]): Promise<string[]> {
        const result: string[] = [];
        const excludes: Map<string, boolean> = new Map<string, boolean>();
        for (const p of paths) {
            if (p.startsWith("!")) {
                let exclude = p.substr(1);
                if (!path.isAbsolute(exclude)) {
                    exclude = path.join(folder?.uri.fsPath || "", exclude);
                }
                // use Uri to normalize the fs path
                excludes.set(vscode.Uri.file(exclude).fsPath, this.isFile(exclude));
                continue;
            }

            result.push(vscode.Uri.file(p).fsPath);
        }

        return result.filter((r) => {
            for (const [excludedPath, isFile] of excludes.entries()) {
                if (isFile && r === excludedPath) {
                    return false;
                }

                if (!isFile && r.startsWith(excludedPath)) {
                    return false;
                }
            }

            return true;
        });
    }

    private mergeScope(scopes: string[]): string | undefined {
        if (scopes.includes(ClasspathVariable.Test)) {
            return "test";
        }

        if (scopes.includes(ClasspathVariable.Auto)) {
            return undefined;
        }

        if (scopes.includes(ClasspathVariable.Runtime)) {
            return "runtime";
        }

        return undefined;
    }

    /**
     * Converts an array of arguments to a string as the args and vmArgs.
     */
    private concatArgs(args: any[]): string {
        return _.join(_.map(args, (arg: any): string => {
            const str = String(arg);
            // if it has quotes or spaces, use double quotes to wrap it
            if (/["\s]/.test(str)) {
                return "\"" + str.replace(/(["\\])/g, "\\$1") + "\"";
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

    private async resolveAndValidateMainClass(folder: vscode.Uri | undefined, config: vscode.DebugConfiguration,
                                              progressReporter: IProgressReporter): Promise<lsPlugin.IMainClassOption | undefined> {
        if (!config.mainClass || this.isFile(config.mainClass)) {
            const currentFile = config.mainClass || _.get(vscode.window.activeTextEditor, "document.uri.fsPath");
            if (currentFile) {
                const mainEntries = await lsPlugin.resolveMainMethod(vscode.Uri.file(currentFile));
                if (progressReporter.isCancelled()) {
                    return undefined;
                } else if (mainEntries.length) {
                    if (!mainClassPicker.isAutoPicked(mainEntries)) {
                        progressReporter.hide(true);
                    }
                    return mainClassPicker.showQuickPick(mainEntries, "Please select a main class you want to run.");
                }
            }

            const hintMessage = currentFile ?
                `The file '${path.basename(currentFile)}' is not executable, please select a main class you want to run.` :
                "Please select a main class you want to run.";
            return this.promptMainClass(folder, progressReporter, hintMessage);
        }

        const containsExternalClasspaths = !_.isEmpty(config.classPaths) || !_.isEmpty(config.modulePaths);
        const validationResponse = await lsPlugin.validateLaunchConfig(config.mainClass, config.projectName, containsExternalClasspaths, folder);
        if (progressReporter.isCancelled()) {
            return undefined;
        } else if (!validationResponse.mainClass.isValid || !validationResponse.projectName.isValid) {
            return this.fixMainClass(folder, config, validationResponse, progressReporter);
        }

        return {
            mainClass: config.mainClass,
            projectName: config.projectName,
        };
    }

    private isFile(filePath: string): boolean {
        try {
            return fs.lstatSync(filePath).isFile();
        } catch (error) {
            // do nothing
            return false;
        }
    }

    private getValidationErrorMessage(error: lsPlugin.IValidationResult): string {
        switch (error.kind) {
            case lsPlugin.CONFIGERROR_INVALID_CLASS_NAME:
                return "ConfigError: mainClass was configured with an invalid class name.";
            case lsPlugin.CONFIGERROR_MAIN_CLASS_NOT_EXIST:
                return "ConfigError: mainClass does not exist.";
            case lsPlugin.CONFIGERROR_MAIN_CLASS_NOT_UNIQUE:
                return "ConfigError: mainClass is not unique in the workspace";
            case lsPlugin.CONFIGERROR_INVALID_JAVA_PROJECT:
                return "ConfigError: could not find a Java project with the configured projectName.";
        }

        return "ConfigError: Invalid mainClass/projectName configs.";
    }

    private async fixMainClass(folder: vscode.Uri | undefined, config: vscode.DebugConfiguration,
                               validationResponse: lsPlugin.ILaunchValidationResponse, progressReporter: IProgressReporter):
        Promise<lsPlugin.IMainClassOption | undefined> {
        const errors: string[] = [];
        if (!validationResponse.mainClass.isValid) {
            errors.push(String(validationResponse.mainClass.message));
            const errorLog: Error = {
                name: "error",
                message: this.getValidationErrorMessage(validationResponse.mainClass),
            };
            setUserError(errorLog);
            sendError(errorLog);
        }

        if (!validationResponse.projectName.isValid) {
            errors.push(String(validationResponse.projectName.message));
            const errorLog: Error = {
                name: "error",
                message: this.getValidationErrorMessage(validationResponse.projectName),
            };
            setUserError(errorLog);
            sendError(errorLog);
        }

        if (validationResponse.proposals && validationResponse.proposals.length) {
            progressReporter.hide(true);
            const answer = await utility.showErrorMessageWithTroubleshooting({
                message: errors.join(os.EOL),
                type: Type.USAGEERROR,
                anchor: anchor.FAILED_TO_RESOLVE_CLASSPATH,
                bypassLog: true, // Avoid logging the raw user input in the logger for privacy.
            }, "Fix");
            if (answer === "Fix") {
                const selectedFix = await mainClassPicker.showQuickPick(validationResponse.proposals,
                    "Please select main class<project name>.", false);
                if (selectedFix) {
                    sendInfo("", {
                        fix: "yes",
                        fixMessage: "Fix the configs of mainClass and projectName",
                    });
                    await this.persistMainClassOption(folder, config, selectedFix);
                }

                return selectedFix;
            }
            // return undefined if the user clicks "Learn More".
            return undefined;
        }

        throw new utility.UserError({
            message: errors.join(os.EOL),
            type: Type.USAGEERROR,
            anchor: anchor.FAILED_TO_RESOLVE_CLASSPATH,
            bypassLog: true, // Avoid logging the raw user input in the logger for privacy.
        });
    }

    private async persistMainClassOption(folder: vscode.Uri | undefined, oldConfig: vscode.DebugConfiguration, change: lsPlugin.IMainClassOption):
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

    private async promptMainClass(folder: vscode.Uri | undefined, progressReporter: IProgressReporter, hintMessage?: string):
        Promise<lsPlugin.IMainClassOption | undefined> {
        const res = await lsPlugin.resolveMainClass(folder);
        if (progressReporter.isCancelled()) {
            return undefined;
        } else if (res.length === 0) {
            const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : undefined;
            throw new utility.UserError({
                message: `Cannot find a class with the main method${ workspaceFolder ? " in the folder '" + workspaceFolder.name + "'" : ""}.`,
                type: Type.USAGEERROR,
                anchor: anchor.CANNOT_FIND_MAIN_CLASS,
            });
        }

        if (!mainClassPicker.isAutoPicked(res)) {
            progressReporter.hide(true);
        }
        return mainClassPicker.showQuickPickWithRecentlyUsed(res, hintMessage || "Select main class<project name>");
    }
}

async function updateDebugSettings(event?: vscode.ConfigurationChangeEvent) {
    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug");
    if (!debugSettingsRoot) {
        return;
    }
    const logLevel = convertLogLevel(debugSettingsRoot.logLevel || "");
    const javaHome = await utility.getJavaHome();
    if (debugSettingsRoot.settings && Object.keys(debugSettingsRoot.settings).length) {
        try {
            const stepFilters = {
                skipClasses: await substituteFilterVariables(debugSettingsRoot.settings.stepping.skipClasses),
                skipSynthetics: debugSettingsRoot.settings.skipSynthetics,
                skipStaticInitializers: debugSettingsRoot.settings.skipStaticInitializers,
                skipConstructors: debugSettingsRoot.settings.skipConstructors,
            };
            const exceptionFilters = {
                skipClasses: await substituteFilterVariables(debugSettingsRoot.settings.exceptionBreakpoint.skipClasses),
            };
            const settings = await commands.executeJavaLanguageServerCommand(commands.JAVA_UPDATE_DEBUG_SETTINGS, JSON.stringify(
                {
                    ...debugSettingsRoot.settings,
                    logLevel,
                    javaHome,
                    stepFilters,
                    exceptionFilters,
                    exceptionFiltersUpdated: event && event.affectsConfiguration("java.debug.settings.exceptionBreakpoint.skipClasses"),
                    limitOfVariablesPerJdwpRequest: Math.max(debugSettingsRoot.settings.jdwp.limitOfVariablesPerJdwpRequest, 1),
                    jdwpRequestTimeout: Math.max(debugSettingsRoot.settings.jdwp.requestTimeout, 100),
                }));
            if (logLevel === "FINE") {
                // tslint:disable-next-line:no-console
                console.log("settings:", settings);
            }
        } catch (err) {
            // log a warning message and continue, since update settings failure should not block debug session
            // tslint:disable-next-line:no-console
            console.log("Cannot update debug settings.", err);
        }
    }
}

function needsBuildWorkspace(): boolean {
    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
    return debugSettingsRoot ? debugSettingsRoot.forceBuildBeforeLaunch : true;
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

// from vscode-js-debug https://github.com/microsoft/vscode-js-debug/blob/master/src/targets/node/nodeLauncherBase.ts
function readEnvFile(file: string): { [key: string]: string } {
    if (!fs.existsSync(file)) {
        return {};
    }

    const buffer = stripBOM(fs.readFileSync(file, "utf8"));
    const env = dotenv.parse(Buffer.from(buffer));

    return env;
}

function stripBOM(s: string): string {
    if (s && s[0] === "\uFEFF") {
        s = s.substr(1);
    }
    return s;
}
