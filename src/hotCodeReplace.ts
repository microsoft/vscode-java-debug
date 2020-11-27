// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

import * as anchor from "./anchor";
import { JAVA_LANGID } from "./constants";
import * as utility from "./utility";

const suppressedReasons: Set<string> = new Set();

export const YES_BUTTON: string = "Yes";

export const NO_BUTTON: string = "No";

const NEVER_BUTTON: string = "Do not show again";

enum HcrChangeType {
    ERROR = "ERROR",
    WARNING = "WARNING",
    STARTING = "STARTING",
    END = "END",
    BUILD_COMPLETE = "BUILD_COMPLETE",
}

export function initializeHotCodeReplace(context: vscode.ExtensionContext) {
    vscode.commands.executeCommand("setContext", "javaHotReload", getHotReloadFlag());
    vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("java.debug.settings.hotCodeReplace")) {
            vscode.commands.executeCommand("setContext", "javaHotReload", getHotReloadFlag());
        }
    });
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession((session) => {
        const t = session ? session.type : undefined;
        if (t === JAVA_LANGID) {
            suppressedReasons.clear();
        }
    }));
}

export function handleHotCodeReplaceCustomEvent(hcrEvent: vscode.DebugSessionCustomEvent) {
    if (hcrEvent.body.changeType === HcrChangeType.BUILD_COMPLETE) {
        if (getHotReloadFlag() === "auto") {
            return vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, (progress) => {
                progress.report({ message: "Applying code changes..." });
                return hcrEvent.session.customRequest("redefineClasses");
            });
        }
    }

    if (hcrEvent.body.changeType === HcrChangeType.ERROR || hcrEvent.body.changeType === HcrChangeType.WARNING) {
        if (!suppressedReasons.has(hcrEvent.body.message)) {
            utility.showWarningMessageWithTroubleshooting({
                message: `Hot code replace failed - ${hcrEvent.body.message}. Would you like to restart the debug session?`,
                anchor: anchor.FAILED_TO_COMPLETE_HCR,
            }, YES_BUTTON, NO_BUTTON, NEVER_BUTTON).then((res) => {
                if (res === NEVER_BUTTON) {
                    suppressedReasons.add(hcrEvent.body.message);
                } else if (res === YES_BUTTON) {
                    vscode.commands.executeCommand("workbench.action.debug.restart");
                }
            });
        }
    }
    return undefined;
}

function getHotReloadFlag(): string {
    return vscode.workspace.getConfiguration("java.debug.settings").get("hotCodeReplace") || "manual";
}
