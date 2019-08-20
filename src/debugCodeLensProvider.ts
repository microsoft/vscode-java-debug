// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import * as vscode from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

import { JAVA_LANGID } from "./constants";
import { IMainMethod, resolveMainMethod } from "./languageServerPlugin";
import { getJavaExtensionAPI, isJavaExtEnabled } from "./utility";

const JAVA_RUN_CODELENS_COMMAND = "java.debug.runCodeLens";
const JAVA_DEBUG_CODELENS_COMMAND = "java.debug.debugCodeLens";
const JAVA_DEBUG_CONFIGURATION = "java.debug.settings";
const ENABLE_CODE_LENS_VARIABLE = "enableRunDebugCodeLens";

export function initializeCodeLensProvider(context: vscode.ExtensionContext): void {
    // delay registering codelens provider until the Java extension is activated.
    if (isActivatedByJavaFile() && isJavaExtEnabled()) {
        getJavaExtensionAPI().then(() => {
            context.subscriptions.push(new DebugCodeLensContainer());
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
    private configurationEvent: vscode.Disposable;

    constructor() {
        this.runCommand = instrumentOperationAsVsCodeCommand(JAVA_RUN_CODELENS_COMMAND, runJavaProgram);
        this.debugCommand = instrumentOperationAsVsCodeCommand(JAVA_DEBUG_CODELENS_COMMAND, debugJavaProgram);

        const configuration = vscode.workspace.getConfiguration(JAVA_DEBUG_CONFIGURATION);
        const isCodeLensEnabled = configuration.get<boolean>(ENABLE_CODE_LENS_VARIABLE);

        if (isCodeLensEnabled) {
            this.lensProvider = vscode.languages.registerCodeLensProvider(JAVA_LANGID, new DebugCodeLensProvider());
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
            }
        }, this);
    }

    public dispose() {
        if (this.lensProvider !== undefined) {
            this.lensProvider.dispose();
        }
        this.runCommand.dispose();
        this.debugCommand.dispose();
        this.configurationEvent.dispose();
    }

}

class DebugCodeLensProvider implements vscode.CodeLensProvider {

    public async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        try {
            const mainMethods: IMainMethod[] = await resolveMainMethod(document.uri);
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

async function constructDebugConfig(mainClass: string, projectName: string, workspace: vscode.Uri): Promise<vscode.DebugConfiguration> {
    const launchConfigurations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("launch", workspace);
    const rawConfigs: vscode.DebugConfiguration[] = launchConfigurations.configurations;

    let debugConfig: vscode.DebugConfiguration = _.find(rawConfigs, (config) => {
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
            name: `CodeLens (Launch) - ${mainClass.substr(mainClass.lastIndexOf(".") + 1)}`,
            request: "launch",
            mainClass,
            projectName,
        };

        // Persist the default debug configuration only if the workspace exists.
        if (workspace) {
            // Insert the default debug configuration to the beginning of launch.json.
            rawConfigs.splice(0, 0, debugConfig);
            await launchConfigurations.update("configurations", rawConfigs, vscode.ConfigurationTarget.WorkspaceFolder);
        }
    }

    return _.cloneDeep(debugConfig);
}

export async function startDebugging(mainClass: string, projectName: string, uri: vscode.Uri, noDebug: boolean): Promise<boolean> {
    const workspaceFolder: vscode.WorkspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const workspaceUri: vscode.Uri = workspaceFolder ? workspaceFolder.uri : undefined;

    const debugConfig: vscode.DebugConfiguration = await constructDebugConfig(mainClass, projectName, workspaceUri);
    debugConfig.projectName = projectName;
    debugConfig.noDebug = noDebug;

    return vscode.debug.startDebugging(workspaceFolder, debugConfig);
}
