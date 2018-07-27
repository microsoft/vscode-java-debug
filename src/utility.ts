// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as opn from "opn";
import * as vscode from "vscode";
import { logger, Type } from "./logger";

const TROUBLESHOOTING_LINK = "https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md";

export async function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    const choice = await vscode.window.showWarningMessage(message, ...items, "Learn More");
    if (choice === "Learn More") {
        logger.log(Type.USAGEDATA, {
            troubleshooting: "yes",
            troubleshootingMessage: message,
        });
        opn(TROUBLESHOOTING_LINK);
        return;
    }
    return choice;
}

export async function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
    const choice = await vscode.window.showErrorMessage(message, ...items, "Learn More");
    if (choice === "Learn More") {
        logger.log(Type.USAGEDATA, {
            troubleshooting: "yes",
            troubleshootingMessage: message,
        });
        opn(TROUBLESHOOTING_LINK);
        return;
    }
    return choice;
}
