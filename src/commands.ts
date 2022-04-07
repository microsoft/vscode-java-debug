// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as utility from "./utility";

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

export const JAVA_RESOLVE_ELEMENT_AT_SELECTION = "vscode.java.resolveElementAtSelection";

export const JAVA_RESOLVE_BUILD_FILES = "vscode.java.resolveBuildFiles";

export const JAVA_IS_ON_CLASSPATH = "vscode.java.isOnClasspath";

export const JAVA_RESOLVE_JAVAEXECUTABLE = "vscode.java.resolveJavaExecutable";

export const JAVA_FETCH_PLATFORM_SETTINGS = "vscode.java.fetchPlatformSettings";

export const JAVA_RESOLVE_CLASSFILTERS = "vscode.java.resolveClassFilters";

export const JAVA_RESOLVE_SOURCE_URI = "vscode.java.resolveSourceUri";

export const JAVA_RESOLVE_INLINE_VARIABLES = "vscode.java.resolveInlineVariables";

export function executeJavaLanguageServerCommand(...rest: any[]) {
    return executeJavaExtensionCommand(JAVA_EXECUTE_WORKSPACE_COMMAND, ...rest);
}

export async function executeJavaExtensionCommand(commandName: string, ...rest: any[]) {
    // TODO: need to handle error and trace telemetry
    const javaExtension = utility.getJavaExtension();
    if (!javaExtension) {
        throw new utility.JavaExtensionNotEnabledError(`Cannot execute command ${commandName}, VS Code Java Extension is not enabled.`);
    }
    if (!javaExtension.isActive) {
        await javaExtension.activate();
    }
    return vscode.commands.executeCommand(commandName, ...rest);
}
