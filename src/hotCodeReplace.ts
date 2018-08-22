// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

import * as anchor from "./anchor";
import { HCR_EVENT, JAVA_LANGID } from "./constants";
import * as utility from "./utility";

const suppressedReasons: Set<string> = new Set();

const YES_BUTTON: string = "Yes";

const NO_BUTTON: string = "No";

const NEVER_BUTTON: string = "Not show again";

enum HcrChangeType {
    ERROR = "ERROR",
    WARNING = "WARNING",
    STARTING = "STARTING",
    END = "END",
    BUILD_COMPLETE = "BUILD_COMPLETE",
}

export function initializeHotCodeReplace(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession((session) => {
        const t = session ? session.type : undefined;
        if (t === JAVA_LANGID) {
            suppressedReasons.clear();
        }
    }));
}

export function handleHotCodeReplaceCustomEvent(hcrEvent) {
    if (hcrEvent.body.changeType === HcrChangeType.BUILD_COMPLETE) {
        return vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, (progress) => {
            progress.report({ message: "Applying code changes..." });
            return hcrEvent.session.customRequest("redefineClasses");
        });
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
}
