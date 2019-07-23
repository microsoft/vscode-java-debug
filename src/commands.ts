// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { JavaExtensionNotActivatedError } from "./utility";

export const VSCODE_STARTDEBUG = "vscode.startDebug";

export const VSCODE_ADD_DEBUGCONFIGURATION = "debug.addConfiguration";

export const JAVA_START_DEBUGSESSION = "vscode.java.startDebugSession";

export const JAVA_RESOLVE_CLASSPATH = "vscode.java.resolveClasspath";

export const JAVA_RESOLVE_MAINCLASS = "vscode.java.resolveMainClass";

export const JAVA_VALIDATE_LAUNCHCONFIG = "vscode.java.validateLaunchConfig";

export const JAVA_BUILD_WORKSPACE = "java.workspace.compile";

export const JAVA_EXECUTE_WORKSPACE_COMMAND = "java.execute.workspaceCommand";

export const JAVA_FETCH_USAGE_DATA = "vscode.java.fetchUsageData";

export const JAVA_UPDATE_DEBUG_SETTINGS = "vscode.java.updateDebugSettings";

export const JAVA_RESOLVE_MAINMETHOD = "vscode.java.resolveMainMethod";

export const JAVA_INFER_LAUNCH_COMMAND_LENGTH = "vscode.java.inferLaunchCommandLength";

export const JAVA_CHECK_PROJECT_SETTINGS = "vscode.java.checkProjectSettings";

export function executeJavaLanguageServerCommand(...rest) {
    // TODO: need to handle error and trace telemetry
    if (!isJavaExtActivated()) {
        throw new JavaExtensionNotActivatedError(
            `Cannot execute command ${JAVA_EXECUTE_WORKSPACE_COMMAND}, VS Code Java Extension is not activated.`);
    }
    return vscode.commands.executeCommand(JAVA_EXECUTE_WORKSPACE_COMMAND, ...rest);
}

export function executeJavaExtensionCommand(commandName: string, ...rest) {
    if (!isJavaExtActivated()) {
        throw new JavaExtensionNotActivatedError(`Cannot execute command ${commandName}, VS Code Java Extension is not activated.`);
    }
    return vscode.commands.executeCommand(commandName, ...rest);
}

const JAVA_EXT = "redhat.java";

export function isJavaExtActivated() {
    const javaExt = vscode.extensions.getExtension(JAVA_EXT);
    return javaExt && javaExt.isActive;
}
