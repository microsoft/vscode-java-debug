// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { sendError, sendInfo, setUserError } from "vscode-extension-telemetry-wrapper";
import { Type } from "./javaLogger";
import { IMainClassOption, resolveMainClass } from "./languageServerPlugin";
import { IProgressReporter } from "./progressAPI";

const TROUBLESHOOTING_LINK = "https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md";
const LEARN_MORE = "Learn More";
const JAVA_EXTENSION_ID = "redhat.java";

export class UserError extends Error {
    public context: ITroubleshootingMessage;

    constructor(context: ITroubleshootingMessage) {
        super(context.message);
        this.context = context;
        setUserError(this);
    }
}

export class JavaExtensionNotEnabledError extends Error {
    constructor(message: string) {
        super(message);
        setUserError(this);
    }
}

export class OperationCancelledError extends Error {
    constructor(message: string) {
        super(message);
    }
}

interface ILoggingMessage {
    type?: Type;
    message: string;
    stack?: string;
    bypassLog?: boolean;
}

interface ITroubleshootingMessage extends ILoggingMessage {
    anchor?: string;
}

function logMessage(message: ILoggingMessage): void {
    if (!message.type || message.bypassLog) {
        return;
    }

    if (message.type === Type.EXCEPTION || message.type === Type.USAGEERROR) {
        const error: Error = {
            name: "error",
            message: message.message,
            stack: message.stack,
        };
        if (message.type === Type.USAGEERROR) {
            setUserError(error);
        }
        sendError(error);
    } else {
        sendInfo("", { message: message.message });
    }
}

export async function showInformationMessage(message: ILoggingMessage, ...items: string[]): Promise<string | undefined> {
    logMessage(message);
    return vscode.window.showInformationMessage(message.message, ...items);
}

export async function showWarningMessage(message: ILoggingMessage, ...items: string[]): Promise<string | undefined> {
    logMessage(message);
    return vscode.window.showWarningMessage(message.message, ...items);
}

export async function showErrorMessage(message: ILoggingMessage, ...items: string[]): Promise<string | undefined> {
    logMessage(message);
    return vscode.window.showErrorMessage(message.message, ...items);
}

export async function showInformationMessageWithTroubleshooting(message: ITroubleshootingMessage, ...items: string[]): Promise<string | undefined> {
    const choice = await showInformationMessage(message, ...items, LEARN_MORE);
    return handleTroubleshooting(message.message, choice, message.anchor);
}

export async function showWarningMessageWithTroubleshooting(message: ITroubleshootingMessage, ...items: string[]): Promise<string | undefined> {
    const choice = await showWarningMessage(message, ...items, LEARN_MORE);
    return handleTroubleshooting(message.message, choice, message.anchor);
}

export async function showErrorMessageWithTroubleshooting(message: ITroubleshootingMessage, ...items: string[]): Promise<string | undefined> {
    const choice = await showErrorMessage(message, ...items, LEARN_MORE);
    return handleTroubleshooting(message.message, choice, message.anchor);
}

function handleTroubleshooting(message: string, choice?: string, anchor?: string): string | undefined {
    if (choice === LEARN_MORE) {
        openTroubleshootingPage(message, anchor);
        return undefined;
    }

    return choice;
}

export function openTroubleshootingPage(message: string, anchor?: string) {
    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(anchor ? `${TROUBLESHOOTING_LINK}#${anchor}` : TROUBLESHOOTING_LINK));
    sendInfo("", {
        troubleshooting: "yes",
        troubleshootingMessage: message,
    });
}

export async function guideToInstallJavaExtension() {
    const MESSAGE = "Language Support for Java is required. Please install and enable it.";
    const INSTALL = "Install";
    const choice = await vscode.window.showWarningMessage(MESSAGE, INSTALL);
    if (choice === INSTALL) {
        await installJavaExtension();
    }
}

async function installJavaExtension() {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification }, async (p) => {
        p.report({ message: "Installing Language Support for Java ..." });
        await vscode.commands.executeCommand("workbench.extensions.installExtension", JAVA_EXTENSION_ID);
    });
    const RELOAD = "Reload Window";
    const choice = await vscode.window.showInformationMessage("Please reload window to activate Language Support for Java.", RELOAD);
    if (choice === RELOAD) {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
}

export function convertErrorToMessage(err: Error): ILoggingMessage {
    const properties = formatErrorProperties(err);
    return {
        type: Type.EXCEPTION,
        message: properties.message,
        stack: properties.stackTrace,
    };
}

function formatErrorProperties(ex: any): any {
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

    return properties;
}

export async function getJavaHome(): Promise<string> {
    const extensionApi = await getJavaExtensionAPI();
    if (extensionApi && extensionApi.javaRequirement) {
        return extensionApi.javaRequirement.java_home;
    }

    return "";
}

export function getJavaExtensionAPI(progressReporter?: IProgressReporter): Thenable<any> {
    const extension = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
    if (!extension) {
        throw new JavaExtensionNotEnabledError("VS Code Java Extension is not enabled.");
    }

    return new Promise<any>(async (resolve) => {
        progressReporter?.getCancellationToken().onCancellationRequested(() => {
            resolve(undefined);
        });

        resolve(await extension.activate());
    });
}

export function getJavaExtension(): vscode.Extension<any> | undefined {
    return vscode.extensions.getExtension(JAVA_EXTENSION_ID);
}

export function isJavaExtEnabled(): boolean {
    const javaExt = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
    return !!javaExt;
}

export function isJavaExtActivated(): boolean {
    const javaExt = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
    return !!javaExt && javaExt.isActive;
}

export function isGitBash(isIntegratedTerminal: boolean): boolean {
    const currentWindowsShellPath: string | undefined = isIntegratedTerminal ? vscode.env.shell :
        vscode.workspace.getConfiguration("terminal")?.get("external.windowsExec");
    if (!currentWindowsShellPath) {
        return false;
    }

    const candidates: string[] = ["Git\\bin\\bash.exe", "Git\\bin\\bash", "Git\\usr\\bin\\bash.exe", "Git\\usr\\bin\\bash"];
    const find: string | undefined = candidates.find((candidate: string) => currentWindowsShellPath.endsWith(candidate));
    return !!find;
}

export enum ServerMode {
    STANDARD = "Standard",
    LIGHTWEIGHT = "LightWeight",
    HYBRID = "Hybrid",
}

/**
 * Wait for Java Language Support extension being on Standard mode,
 * and return true if the final status is on Standard mode.
 */
export async function waitForStandardMode(progressReporter: IProgressReporter): Promise<boolean> {
    const importMessage = progressReporter?.getProgressLocation() === vscode.ProgressLocation.Notification ?
        "Importing projects, [check details](command:java.show.server.task.status)" : "Importing projects...";
    if (await isImportingProjects()) {
        progressReporter.report(importMessage);
    }

    const api = await getJavaExtensionAPI(progressReporter);
    if (!api) {
        return false;
    }

    if (api && api.serverMode === ServerMode.LIGHTWEIGHT) {
        const answer = await vscode.window.showInformationMessage("Run/Debug feature requires Java language server to run in Standard mode. "
            + "Do you want to switch it to Standard mode now?", "Yes", "Cancel");
        if (answer === "Yes") {
            if (api.serverMode === ServerMode.STANDARD) {
                return true;
            }

            progressReporter?.report(importMessage);
            return new Promise<boolean>((resolve) => {
                progressReporter.getCancellationToken().onCancellationRequested(() => {
                    resolve(false);
                });
                api.onDidServerModeChange((mode: string) => {
                    if (mode === ServerMode.STANDARD) {
                        resolve(true);
                    }
                });

                vscode.commands.executeCommand("java.server.mode.switch", ServerMode.STANDARD, true);
            });
        }

        return false;
    } else if (api && api.serverMode === ServerMode.HYBRID) {
        progressReporter.report(importMessage);
        return new Promise<boolean>((resolve) => {
            progressReporter.getCancellationToken().onCancellationRequested(() => {
                resolve(false);
            });
            api.onDidServerModeChange((mode: string) => {
                if (mode === ServerMode.STANDARD) {
                    resolve(true);
                }
            });
        });
    }

    return true;
}

export async function searchMainMethods(uri?: vscode.Uri): Promise<IMainClassOption[]> {
    return resolveMainClass(uri);
}

export async function searchMainMethodsWithProgress(uri?: vscode.Uri): Promise<IMainClassOption[]> {
    try {
        return await vscode.window.withProgress<IMainClassOption[]>(
            { location: vscode.ProgressLocation.Window },
            async (p) => {
                p.report({ message: "Searching main classes..." });
                return resolveMainClass(uri);
            });
    } catch (ex) {
        vscode.window.showErrorMessage(String((ex && ex.message) || ex));
        throw ex;
    }
}

async function isImportingProjects(): Promise<boolean> {
    const extension = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
    if (!extension) {
        return false;
    }

    const serverMode = getJavaServerMode();
    if (serverMode === ServerMode.STANDARD || serverMode === ServerMode.HYBRID) {
        const allCommands = await vscode.commands.getCommands();
        return (!extension.isActive && allCommands.includes("java.show.server.task.status"))
            || (extension.isActive && extension.exports?.serverMode === ServerMode.HYBRID);
    }

    return false;
}

function getJavaServerMode(): ServerMode {
    return vscode.workspace.getConfiguration().get("java.server.launchMode")
        || ServerMode.HYBRID;
}
