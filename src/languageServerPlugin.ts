// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

import * as commands from "./commands";
import { logger, Type } from "./logger";
import * as utility from "./utility";

export interface IMainClassOption {
    readonly mainClass: string;
    readonly projectName?: string;
    readonly filePath?: string;
}

export interface IMainMethod extends IMainClassOption {
    range: vscode.Range;
}

export interface IValidationResult {
    readonly isValid: boolean;
    readonly message?: string;
}

export interface ILaunchValidationResponse {
    readonly mainClass: IValidationResult;
    readonly projectName: IValidationResult;
    readonly proposals?: IMainClassOption[];
}

export async function resolveMainMethod(uri: vscode.Uri): Promise<IMainMethod[]> {
    try {
        return <IMainMethod[]> await commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINMETHOD, uri.toString());
    } catch (ex) {
        logger.log(Type.EXCEPTION, utility.formatErrorProperties(ex));
        return [];
    }
}

export function startDebugSession() {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_START_DEBUGSESSION);
}

export function resolveClasspath(mainClass, projectName) {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_CLASSPATH, mainClass, projectName);
}

export function resolveMainClass(workspaceUri: vscode.Uri): Promise<IMainClassOption[]> {
    if (workspaceUri) {
        return <Promise<IMainClassOption[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINCLASS, workspaceUri.toString());
    }
    return <Promise<IMainClassOption[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINCLASS);
}

export function validateLaunchConfig(workspaceUri: vscode.Uri, mainClass: string, projectName: string, containsExternalClasspaths: boolean):
    Promise<ILaunchValidationResponse> {
    return <Promise<ILaunchValidationResponse>>commands.executeJavaLanguageServerCommand(commands.JAVA_VALIDATE_LAUNCHCONFIG,
        workspaceUri ? workspaceUri.toString() : undefined, mainClass, projectName, containsExternalClasspaths);
}

export function inferLaunchCommandLength(config: vscode.DebugConfiguration): Promise<number> {
    return <Promise<number>>commands.executeJavaLanguageServerCommand(commands.JAVA_INFER_LAUNCH_COMMAND_LENGTH, JSON.stringify(config));
}

export function checkProjectSettings(className: string, projectName: string, inheritedOptions: boolean, expectedOptions: {[key: string]: string}):
Promise<boolean> {
    return <Promise<boolean>>commands.executeJavaLanguageServerCommand(
        commands.JAVA_CHECK_PROJECT_SETTINGS, JSON.stringify({
            className,
            projectName,
            inheritedOptions,
            expectedOptions,
        }));
}

const COMPILER_PB_ENABLE_PREVIEW_FEATURES: string = "org.eclipse.jdt.core.compiler.problem.enablePreviewFeatures";
export async function detectPreviewFlag(className: string, projectName: string): Promise<boolean> {
    const expectedOptions = {
        [COMPILER_PB_ENABLE_PREVIEW_FEATURES]: "enabled",
    };
    return await checkProjectSettings(className, projectName, true, expectedOptions);
}
