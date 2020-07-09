// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { setUserError } from "vscode-extension-telemetry-wrapper";
import { logger, Type } from "./logger";

const TROUBLESHOOTING_LINK = "https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md";
const LEARN_MORE = "Learn More";
const JAVA_EXTENSION_ID = "redhat.java";
const DEBUGGER_EXTENSION_ID = "vscjava.vscode-java-debug";

export class UserError extends Error {
    public context: ITroubleshootingMessage;

    constructor(context: ITroubleshootingMessage) {
        super(context.message);
        this.context = context;
        setUserError(this);
    }
}

export class JavaExtensionNotEnabledError extends Error {
    constructor(message) {
        super(message);
        setUserError(this);
    }
}

interface IProperties {
    [key: string]: string;
}

interface ILoggingMessage {
    message: string;
    type?: Type;
    details?: IProperties;
}

interface ITroubleshootingMessage extends ILoggingMessage {
    anchor?: string;
}

function logMessage(message: ILoggingMessage): void {
    if (!message.type) {
        return;
    }

    if (message.details) {
        logger.log(message.type, message.details);
    } else {
        logger.logMessage(message.type, message.message);
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
    return handleTroubleshooting(choice, message.message, message.anchor);
}

export async function showWarningMessageWithTroubleshooting(message: ITroubleshootingMessage, ...items: string[]): Promise<string | undefined> {
    const choice = await showWarningMessage(message, ...items, LEARN_MORE);
    return handleTroubleshooting(choice, message.message, message.anchor);
}

export async function showErrorMessageWithTroubleshooting(message: ITroubleshootingMessage, ...items: string[]): Promise<string | undefined> {
    const choice = await showErrorMessage(message, ...items, LEARN_MORE);
    return handleTroubleshooting(choice, message.message, message.anchor);
}

function handleTroubleshooting(choice: string, message: string, anchor: string): string | undefined {
    if (choice === LEARN_MORE) {
        openTroubleshootingPage(message, anchor);
        return;
    }

    return choice;
}

export function openTroubleshootingPage(message: string, anchor: string) {
    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(anchor ? `${TROUBLESHOOTING_LINK}#${anchor}` : TROUBLESHOOTING_LINK));
    logger.log(Type.USAGEDATA, {
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

export function formatErrorProperties(ex: any): IProperties {
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

export function getJavaExtensionAPI(): Thenable<any> {
    const extension = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
    if (!extension) {
        throw new JavaExtensionNotEnabledError("VS Code Java Extension is not enabled.");
    }

    return extension.activate();
}

export function getJavaExtension(): vscode.Extension<any> {
    return vscode.extensions.getExtension(JAVA_EXTENSION_ID);
}

export function isJavaExtEnabled(): boolean {
    const javaExt = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
    return !!javaExt;
}

export function isJavaExtActivated(): boolean {
    const javaExt = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
    return javaExt && javaExt.isActive;
}

export function getLauncherScriptPath() {
    const ext = vscode.extensions.getExtension(DEBUGGER_EXTENSION_ID);
    return path.join(ext.extensionPath, "scripts", "launcher.bat");
}

/**
 * Wait for Java Language Support extension being on Standard mode,
 * and return true if the final status is on Standard mode.
 */
export async function waitForStandardMode(): Promise<boolean> {
    const api = await getJavaExtensionAPI();
    if (api && api.serverMode === "LightWeight") {
        const answer = await vscode.window.showInformationMessage("Run/Debug feature requires Java language server to run in Standard mode. "
            + "Do you want to switch it to Standard mode now?", "Yes", "Cancel");
        if (answer === "Yes") {
            await vscode.commands.executeCommand("java.server.mode.switch", "Standard", true);
            return vscode.window.withProgress<boolean>({ location: vscode.ProgressLocation.Window }, async (progress) => {
                progress.report({ message: "Switching to Standard mode..." });
                return new Promise<boolean>(resolve => {
                    api.onDidServerModeChange((mode: string) => {
                        resolve(true);
                    });
                });
            });
        }

        return false;
    } else if (api && api.serverMode === "Hybrid") {
        return new Promise<boolean>(resolve => {
            api.onDidServerModeChange((mode: string) => {
                resolve(true);
            });
        });
    }

    return true;
}
