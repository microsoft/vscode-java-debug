// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Range } from "vscode-languageserver-types";

import * as commands from "./commands";

export enum CompileWorkspaceStatus {
    FAILED = 0,
    SUCCEED = 1,
    WITHERROR = 2,
    CANCELLED = 3,
}

export interface IMainClassOption {
    readonly mainClass: string;
    readonly projectName?: string;
    readonly filePath?: string;
}

export interface IMainMethod extends IMainClassOption {
    range: vscode.Range;
}

export const CONFIGERROR_INVALID_CLASS_NAME = 1;
export const CONFIGERROR_MAIN_CLASS_NOT_EXIST = 2;
export const CONFIGERROR_MAIN_CLASS_NOT_UNIQUE = 3;
export const CONFIGERROR_INVALID_JAVA_PROJECT = 4;
export interface IValidationResult {
    readonly isValid: boolean;
    readonly message?: string;
    readonly kind?: number;
}

export interface ILaunchValidationResponse {
    readonly mainClass: IValidationResult;
    readonly projectName: IValidationResult;
    readonly proposals?: IMainClassOption[];
}

export async function resolveMainMethod(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<IMainMethod[]> {
    if (token) {
        return <IMainMethod[]> await commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINMETHOD, uri.toString(), token);
    }

    return <IMainMethod[]> await commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINMETHOD, uri.toString());
}

export function startDebugSession() {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_START_DEBUGSESSION);
}

export function resolveClasspath(mainClass: string, projectName: string, scope?: string) {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_CLASSPATH, mainClass, projectName, scope);
}

export function resolveMainClass(workspaceUri?: vscode.Uri): Promise<IMainClassOption[]> {
    if (workspaceUri) {
        return <Promise<IMainClassOption[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINCLASS, workspaceUri.toString());
    }
    return <Promise<IMainClassOption[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINCLASS);
}

export function resolveMainClassFromProject(projectName: string): Promise<IMainClassOption[]> {
    return <Promise<IMainClassOption[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_MAINCLASS, projectName);
}

export function validateLaunchConfig(mainClass: string, projectName: string, containsExternalClasspaths: boolean, workspaceUri?: vscode.Uri):
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
    return checkProjectSettings(className, projectName, true, expectedOptions);
}

export function resolveElementAtSelection(uri: string, line: number, character: number): Promise<any> {
    return <Promise<any>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_ELEMENT_AT_SELECTION, uri, line, character);
}

export function resolveBuildFiles(): Promise<string[]> {
    return <Promise<string[]>>commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_BUILD_FILES);
}

export async function isOnClasspath(uri: string): Promise<boolean> {
    try {
        return <boolean> await commands.executeJavaExtensionCommand(commands.JAVA_IS_ON_CLASSPATH, uri);
    } catch (error) {
        return true;
    }
}

export function resolveJavaExecutable(mainClass: string, projectName: string) {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_JAVAEXECUTABLE, mainClass, projectName);
}

export function fetchPlatformSettings(): any {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_FETCH_PLATFORM_SETTINGS);
}

export async function resolveClassFilters(patterns: string[]): Promise<string[]> {
    return <string[]> await commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_CLASSFILTERS, ...patterns);
}

export async function resolveSourceUri(line: string): Promise<string> {
    return <string> await commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_SOURCE_URI, line);
}

export async function resolveInlineVariables(inlineParams: InlineParams): Promise<InlineVariable[]> {
    return <InlineVariable[]> await commands.executeJavaLanguageServerCommand(commands.JAVA_RESOLVE_INLINE_VARIABLES, JSON.stringify(inlineParams));
}

// tslint:disable-next-line:interface-name
export interface InlineParams {
    uri: string;
    viewPort?: Range;
    stoppedLocation: Range;
}

// tslint:disable-next-line:interface-name
export enum InlineKind {
    VariableLookup = 0,
    Evaluation = 1,
}

// tslint:disable-next-line:interface-name
export interface InlineVariable {
    range: Range;
    name: string;
    kind: InlineKind;
    expression: string;
    declaringClass: string;
}
