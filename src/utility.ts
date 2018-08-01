// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as opn from "opn";
import * as vscode from "vscode";
import { logger, Type } from "./logger";

const TROUBLESHOOTING_LINK = "https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md";
const LEARN_MORE = "Learn More";

interface IMessage {
    message: string;
    type?: Type;
    details?: { [key: string]: string; };
}

function logMessage(message: IMessage): void {
    if (!message.type) {
        return;
    }

    if (message.details) {
        logger.log(message.type, message.details);
    } else {
        logger.logMessage(message.type, message.message);
    }
}

export async function showInformationMessage(message: IMessage, ...items: string[]): Promise<string | undefined> {
    logMessage(message);
    return await vscode.window.showInformationMessage(message.message, ...items);
}

export async function showWarningMessage(message: IMessage, ...items: string[]): Promise<string | undefined> {
    logMessage(message);
    return await vscode.window.showWarningMessage(message.message, ...items);
}

export async function showErrorMessage(message: IMessage, ...items: string[]): Promise<string | undefined> {
    logMessage(message);
    return await vscode.window.showErrorMessage(message.message, ...items);
}

export async function showInformationMessageWithTroubleshooting(message: IMessage, ...items: string[]): Promise<string | undefined> {
    const choice = await showInformationMessage(message, ...items, LEARN_MORE);
    return handleTroubleshooting(choice, message.message);
}

export async function showWarningMessageWithTroubleshooting(message: IMessage, ...items: string[]): Promise<string | undefined> {
    const choice = await showWarningMessage(message, ...items, LEARN_MORE);
    return handleTroubleshooting(choice, message.message);
}

export async function showErrorMessageWithTroubleshooting(message: IMessage, ...items: string[]): Promise<string | undefined> {
    const choice = await showErrorMessage(message, ...items, LEARN_MORE);
    return handleTroubleshooting(choice, message.message);
}

function openLink(url: string): void {
    opn(url);
}

function handleTroubleshooting(choice: string, message: string): string | undefined {
    if (choice === LEARN_MORE) {
        openLink(TROUBLESHOOTING_LINK);
        logger.log(Type.USAGEDATA, {
            troubleshooting: "yes",
            troubleshootingMessage: message,
        });
        return;
    }

    return choice;
}
