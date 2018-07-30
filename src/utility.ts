// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as opn from "opn";
import * as vscode from "vscode";
import { logger, Type } from "./logger";

function openLearnMoreLink(message: string): void {
    const TROUBLESHOOTING_LINK = "https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md";
    opn(TROUBLESHOOTING_LINK);
    logger.log(Type.USAGEDATA, {
        troubleshooting: "yes",
        troubleshootingMessage: message,
    });
}

export async function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    const choice = await vscode.window.showWarningMessage(message, ...items, "Learn More");
    if (choice === "Learn More") {
        openLearnMoreLink(message);
        return;
    }
    return choice;
}

export async function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
    const choice = await vscode.window.showErrorMessage(message, ...items, "Learn More");
    if (choice === "Learn More") {
        openLearnMoreLink(message);
        return;
    }
    return choice;
}
