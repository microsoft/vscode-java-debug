// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import * as path from "path";
import * as vscode from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

import { JAVA_LANGID } from "./constants";
import { initializeHoverProvider } from "./hoverProvider";
import { IMainMethod, isOnClasspath, resolveMainMethod } from "./languageServerPlugin";
import { IProgressReporter } from "./progressAPI";
import { getJavaExtensionAPI, isJavaExtEnabled, ServerMode } from "./utility";

const JAVA_RUN_CODELENS_COMMAND = "java.debug.runCodeLens";
const JAVA_DEBUG_CODELENS_COMMAND = "java.debug.debugCodeLens";
const JAVA_DEBUG_CONFIGURATION = "java.debug.settings";
const ENABLE_CODE_LENS_VARIABLE = "enableRunDebugCodeLens";

export function initializeCodeLensProvider(context: vscode.ExtensionContext): void {
    // delay registering codelens provider until the Java extension is activated.
    if (isActivatedByJavaFile() && isJavaExtEnabled()) {
        getJavaExtensionAPI().then((api) => {
            if (api && (api.serverMode === ServerMode.LIGHTWEIGHT || api.serverMode === ServerMode.HYBRID)) {
                api.onDidServerModeChange((mode: string) => {
                    if (mode === ServerMode.STANDARD) {
                        context.subscriptions.push(new DebugCodeLensContainer());
                    }
                });
            } else {
                context.subscriptions.push(new DebugCodeLensContainer());
            }
        });
    } else {
        context.subscriptions.push(new DebugCodeLensContainer());
    }
}

function isActivatedByJavaFile(): boolean {
    if (vscode.window.activeTextEditor) {
        return vscode.window.activeTextEditor.document && vscode.window.activeTextEditor.document.languageId === "java";
    }

    return false;
}

class DebugCodeLensContainer implements vscode.Disposable {
    private runCommand: vscode.Disposable;
    private debugCommand: vscode.Disposable;
    private lensProvider: vscode.Disposable | undefined;
    private hoverProvider: vscode.Disposable | undefined;
    private configurationEvent: vscode.Disposable;

    constructor() {
        this.runCommand = instrumentOperationAsVsCodeCommand(JAVA_RUN_CODELENS_COMMAND, runJavaProgram);
        this.debugCommand = instrumentOperationAsVsCodeCommand(JAVA_DEBUG_CODELENS_COMMAND, debugJavaProgram);

        const configuration = vscode.workspace.getConfiguration(JAVA_DEBUG_CONFIGURATION);
        const isCodeLensEnabled = configuration.get<boolean>(ENABLE_CODE_LENS_VARIABLE);

        if (isCodeLensEnabled) {
            this.lensProvider = vscode.languages.registerCodeLensProvider(JAVA_LANGID, new DebugCodeLensProvider());
        } else {
            this.hoverProvider = initializeHoverProvider();
        }

        this.configurationEvent = vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) =>  {
            if (event.affectsConfiguration(JAVA_DEBUG_CONFIGURATION)) {
                const newConfiguration = vscode.workspace.getConfiguration(JAVA_DEBUG_CONFIGURATION);
                const newEnabled = newConfiguration.get<boolean>(ENABLE_CODE_LENS_VARIABLE);
                if (newEnabled && this.lensProvider === undefined) {
                    this.lensProvider = vscode.languages.registerCodeLensProvider(JAVA_LANGID, new DebugCodeLensProvider());
                } else if (!newEnabled && this.lensProvider !== undefined) {
                    this.lensProvider.dispose();
                    this.lensProvider = undefined;
                }

                if (newEnabled && this.hoverProvider) {
                    this.hoverProvider.dispose();
                    this.hoverProvider = undefined;
                } else if (!newEnabled && !this.hoverProvider) {
                    this.hoverProvider = initializeHoverProvider();
                }
            }
        }, this);
    }

    public dispose() {
        if (this.lensProvider !== undefined) {
            this.lensProvider.dispose();
        }
        if (this.hoverProvider) {
            this.hoverProvider.dispose();
        }
        this.runCommand.dispose();
        this.debugCommand.dispose();
        this.configurationEvent.dispose();
    }

}

class DebugCodeLensProvider implements vscode.CodeLensProvider {

    public async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        try {
            const mainMethods: IMainMethod[] = await resolveMainMethod(document.uri, token);
            return _.flatten(mainMethods.map((method) => {
                return [
                    new vscode.CodeLens(method.range, {
                        title: "Run",
                        command: JAVA_RUN_CODELENS_COMMAND,
                        tooltip: "Run Java Program",
                        arguments: [ method.mainClass, method.projectName, document.uri ],
                    }),
                    new vscode.CodeLens(method.range, {
                        title: "Debug",
                        command: JAVA_DEBUG_CODELENS_COMMAND,
                        tooltip: "Debug Java Program",
                        arguments: [ method.mainClass, method.projectName, document.uri ],
                    }),
                ];
            }));
        } catch (ex) {
            // do nothing.
            return [];
        }
    }
}

function runJavaProgram(mainClass: string, projectName: string, uri: vscode.Uri): Promise<boolean> {
    return startDebugging(mainClass, projectName, uri, true);
}

function debugJavaProgram(mainClass: string, projectName: string, uri: vscode.Uri): Promise<boolean> {
    return startDebugging(mainClass, projectName, uri, false);
}

async function constructDebugConfig(mainClass: string, projectName: string, workspace?: vscode.Uri): Promise<vscode.DebugConfiguration> {
    const launchConfigurations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("launch", workspace);
    const rawConfigs: vscode.DebugConfiguration[] = launchConfigurations.configurations;

    let debugConfig: vscode.DebugConfiguration | undefined = _.find(rawConfigs, (config) => {
        return config.mainClass === mainClass && _.toString(config.projectName) === _.toString(projectName);
    });

    if (!debugConfig) {
        debugConfig = _.find(rawConfigs, (config) => {
            return config.mainClass === mainClass && !config.projectName;
        });
    }

    if (!debugConfig) {
        debugConfig = {
            type: "java",
            name: `Launch ${mainClass.substr(mainClass.lastIndexOf(".") + 1)}`,
            request: "launch",
            mainClass,
            projectName,
        };

        // Persist the configuration into launch.json only if the launch.json file already exists in the workspace.
        if ((rawConfigs && rawConfigs.length) || await launchJsonExists(workspace)) {
            try {
                // Insert the default debug configuration to the beginning of launch.json.
                rawConfigs.splice(0, 0, debugConfig);
                await launchConfigurations.update("configurations", rawConfigs, vscode.ConfigurationTarget.WorkspaceFolder);
            } catch (error) {
                // When launch.json has unsaved changes before invoking the update api, it will throw the error below:
                // 'Unable to write into launch configuration file because the file is dirty. Please save it first and then try again.'
                // It's safe to ignore it because the only impact is the configuration is not saved, but you can continue to start the debugger.
            }
        }
    }

    return _.cloneDeep(debugConfig);
}

async function launchJsonExists(workspace?: vscode.Uri): Promise<boolean> {
    if (!workspace) {
        return false;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspace);
    const results: vscode.Uri[] = await vscode.workspace.findFiles(".vscode/launch.json");
    return !!results.find((launchJson) => vscode.workspace.getWorkspaceFolder(launchJson) === workspaceFolder);
}

export async function startDebugging(mainClass: string, projectName: string, uri: vscode.Uri, noDebug: boolean,
                                     progressReporter?: IProgressReporter): Promise<boolean> {
    const workspaceFolder: vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(uri);
    const workspaceUri: vscode.Uri | undefined = workspaceFolder ? workspaceFolder.uri : undefined;
    const onClasspath = await isOnClasspath(uri.toString());
    if (workspaceUri && onClasspath === false && !(await addToClasspath(uri))) {
        return false;
    }

    const debugConfig: vscode.DebugConfiguration = await constructDebugConfig(mainClass, projectName, workspaceUri);
    debugConfig.projectName = projectName;
    debugConfig.noDebug = noDebug;
    debugConfig.__progressId = progressReporter?.getId();

    return vscode.debug.startDebugging(workspaceFolder, debugConfig);
}

async function addToClasspath(uri: vscode.Uri): Promise<boolean> {
    const fileName = path.basename(uri.fsPath || "");
    const parentFsPath = path.dirname(uri.fsPath || "");
    if (!parentFsPath) {
        return true;
    }

    const parentUri = vscode.Uri.file(parentFsPath);
    let parentPath = vscode.workspace.asRelativePath(parentUri, true);
    if (parentPath === parentUri.fsPath) {
        parentPath = path.basename(parentFsPath);
    }
    const ans = await vscode.window.showWarningMessage(`The file ${fileName} isn't on the classpath, the runtime may throw class not found error. `
        + `Do you want to add the parent folder "${parentPath}" to Java source path?`, "Add to Source Path", "Skip");
    if (ans === "Skip") {
        return true;
    } else if (ans === "Add to Source Path") {
        vscode.commands.executeCommand("java.project.addToSourcePath.command", parentUri);
    }

    return false;
}
