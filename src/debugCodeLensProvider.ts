// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import * as vscode from "vscode";

import * as commands from "./commands";
import { JAVA_LANGID } from "./constants";
import { logger, Type } from "./logger";
import * as utility from "./utility";

const JAVA_RUN_COMMAND = "vscode.java.run";
const JAVA_DEBUG_COMMAND = "vscode.java.debug";

export function initializeCodeLensProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(JAVA_LANGID, new DebugCodeLensProvider()));
    context.subscriptions.push(vscode.commands.registerCommand(JAVA_RUN_COMMAND, runJavaProgram));
    context.subscriptions.push(vscode.commands.registerCommand(JAVA_DEBUG_COMMAND, debugJavaProgram));
}

class DebugCodeLensProvider implements vscode.CodeLensProvider {

    public async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        const mainMethods: IMainMethod[] = await resolveMainMethod(document);
        return _.flatten(mainMethods.map((method) => {
            return [
                new vscode.CodeLens(method.range, {
                    title: "▶ Run",
                    command: JAVA_RUN_COMMAND,
                    tooltip: "Run Java Program",
                    arguments: [ method.mainClass, method.projectName, document.uri ],
                }),
                new vscode.CodeLens(method.range, {
                    title: "🐞 Debug",
                    command: JAVA_DEBUG_COMMAND,
                    tooltip: "Debug Java Program",
                    arguments: [ method.mainClass, method.projectName, document.uri ],
                }),
            ];
        }));
    }
}

function runJavaProgram(mainClass: string, projectName: string, uri: vscode.Uri): Promise<void> {
    return runCodeLens(mainClass, projectName, uri, true);
}

function debugJavaProgram(mainClass: string, projectName: string, uri: vscode.Uri): Promise<void> {
    return runCodeLens(mainClass, projectName, uri, false);
}

async function runCodeLens(mainClass: string, projectName: string, uri: vscode.Uri, noDebug: boolean): Promise<void> {
    const workspaceFolder: vscode.WorkspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const workspaceUri: vscode.Uri = workspaceFolder ? workspaceFolder.uri : undefined;

    const debugConfig: vscode.DebugConfiguration = await constructDebugConfig(mainClass, projectName, workspaceUri);
    debugConfig.projectName = projectName;
    debugConfig.noDebug = noDebug;

    vscode.debug.startDebugging(workspaceFolder, debugConfig);

    logger.log(Type.USAGEDATA, {
        runCodeLens: "yes",
        noDebug: String(noDebug),
    });
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
            // tslint:disable-next-line
            cwd: workspace ? "${workspaceFolder}" : undefined,
            console: "internalConsole",
            stopOnEntry: false,
            mainClass,
            args: "",
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

async function resolveMainMethod(document: vscode.TextDocument): Promise<IMainMethod[]> {
    try {
        return <IMainMethod[]> await commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINMETHOD, document.uri.toString());
    } catch (ex) {
        logger.log(Type.EXCEPTION, utility.formatErrorProperties(ex));
        return [];
    }
}

interface IMainMethod {
    range: vscode.Range;
    mainClass: string;
    projectName: string;
}
