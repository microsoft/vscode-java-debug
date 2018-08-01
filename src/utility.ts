// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as opn from "opn";
import * as vscode from "vscode";
import { logger, Type } from "./logger";

const TROUBLESHOOTING_LINK = "https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md";

function openLink(url: string): void {
    opn(url);
}

enum MessageType {
    WARNING = "WARNING",
    ERROR = "ERROR",
}

async function showMessage(type: MessageType, message: string, ...items: string[]): Promise<string | undefined> {
    let choice;
    if (type === MessageType.WARNING) {
        choice = await vscode.window.showWarningMessage(message, ...items, "Learn More");
    } else if (type === MessageType.ERROR) {
        choice = await vscode.window.showErrorMessage(message, ...items, "Learn More");
    }

    if (choice === "Learn More") {
        openLink(TROUBLESHOOTING_LINK);
        logger.log(Type.USAGEDATA, {
            troubleshooting: "yes",
            troubleshootingMessage: message,
        });
        return;
    }

    return choice;
}

export async function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return await showMessage(MessageType.WARNING, message, ...items);
}

export async function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return await showMessage(MessageType.ERROR, message, ...items);
}
