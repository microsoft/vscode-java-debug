// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as expandHomeDir from "expand-home-dir";
import * as findJavaHome from "find-java-home";
import * as opn from "opn";
import * as path from "path";
import * as pathExists from "path-exists";
import * as vscode from "vscode";
import { logger, Type } from "./logger";

const TROUBLESHOOTING_LINK = "https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md";
const LEARN_MORE = "Learn More";

export class UserError extends Error {
    public context: ITroubleshootingMessage;

    constructor(context: ITroubleshootingMessage) {
        super(context.message);
        this.context = context;
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
    return await vscode.window.showInformationMessage(message.message, ...items);
}

export async function showWarningMessage(message: ILoggingMessage, ...items: string[]): Promise<string | undefined> {
    logMessage(message);
    return await vscode.window.showWarningMessage(message.message, ...items);
}

export async function showErrorMessage(message: ILoggingMessage, ...items: string[]): Promise<string | undefined> {
    logMessage(message);
    return await vscode.window.showErrorMessage(message.message, ...items);
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

function openLink(url: string): void {
    opn(url);
}

function handleTroubleshooting(choice: string, message: string, anchor: string): string | undefined {
    if (choice === LEARN_MORE) {
        openLink(anchor ? `${TROUBLESHOOTING_LINK}#${anchor}` : TROUBLESHOOTING_LINK);
        logger.log(Type.USAGEDATA, {
            troubleshooting: "yes",
            troubleshootingMessage: message,
        });
        return;
    }

    return choice;
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

export function getJavaHome(): Promise<string> {
    const EXE_SUFFIX = process.platform.startsWith("win") ? ".exe" : "";
    return new Promise((resolve, reject) => {
        let javaHome: string = readJavaConfig() || process.env.JDK_HOME || process.env.JAVA_HOME;
        if (javaHome) {
            javaHome = expandHomeDir(javaHome);
            if (pathExists.sync(javaHome) && pathExists.sync(path.resolve(javaHome, "bin", `javac${EXE_SUFFIX}`))) {
                return resolve(javaHome);
            }
        }

        findJavaHome((err, home) => {
            resolve(err ? "" : expandHomeDir(home));
        });
    });
}

function readJavaConfig(): string {
    const config = vscode.workspace.getConfiguration();
    return config.get<string>("java.home", null);
}
