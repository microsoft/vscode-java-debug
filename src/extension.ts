// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import * as commands from "./commands";

export function activate(context: vscode.ExtensionContext) {
    vscode.commands.registerCommand(commands.JAVA_START_DEBUGSESSION, async (config) => {
        if (Object.keys(config).length === 0) { // No launch.json in current workspace.
            const ans = await vscode.window.showInformationMessage(
                "\"launch.json\" is needed to start the debugger. Do you want to create it now?", "Yes", "No");
            if (ans === "Yes") {
                vscode.commands.executeCommand(commands.VSCODE_ADD_DEBUGCONFIGURATION);
            }
            return;
        } else if (config.request === "launch") {
            if (!config.mainClass) {
                vscode.window.showErrorMessage("Please specify the mainClass in the launch.json.");
                return;
            } else if (!config.classPaths || !Array.isArray(config.classPaths) || !config.classPaths.length) {
                config.classPaths = await resolveClasspath(config.mainClass, config.projectName);
            }
            if (!config.classPaths || !Array.isArray(config.classPaths) || !config.classPaths.length) {
                vscode.window.showErrorMessage("Cannot resolve the classpaths automatically, please specify the value in the launch.json.");
                return;
            }
        } else if (config.request === "attach") {
            if (!config.hostName || !config.port) {
                vscode.window.showErrorMessage("Please specify the host name and the port of the remote debuggee in the launch.json.");
                return;
            }
        } else {
            const ans = await vscode.window.showErrorMessage(
                "Request type \"" + config.request + "\" is not supported. Only \"launch\" and \"attach\" are supported.", "Open launch.json");
            if (ans === "Open launch.json") {
                vscode.commands.executeCommand(commands.VSCODE_ADD_DEBUGCONFIGURATION);
            }
            return;
        }
        const debugServerPort = await startDebugSession();
        if (debugServerPort) {
            config.debugServer = debugServerPort;
            vscode.commands.executeCommand(commands.VSCODE_STARTDEBUG, config);
        } else {
            // Information for diagnostic:
            console.log("Cannot find a port for debugging session");
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function startDebugSession() {
    return executeJavaLanguageServerCommand(commands.JAVA_START_DEBUGSESSION);
}

function resolveClasspath(mainClass, projectName) {
    return executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_CLASSPATH, mainClass, projectName);
}

function executeJavaLanguageServerCommand(...rest) {
    return vscode.commands.executeCommand(commands.JAVA_EXECUTE_WORKSPACE_COMMAND, ...rest);
}
