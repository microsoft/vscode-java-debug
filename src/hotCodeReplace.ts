// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const runningSessions: Set<vscode.DebugSession> = new Set();

const suppressedReasons: Set<string> = new Set();

const NOT_SHOW_AGAIN: string = "Not show again";

export function startHotCodeReplace(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.debug.onDidStartDebugSession((session) => {
        const t = session ? session.type : undefined;
        if (t === "java") {
            runningSessions.add(session);
        }
    }));

    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession((session) => {
        const t = session ? session.type : undefined;
        if (t === "java") {
            runningSessions.delete(session);
            suppressedReasons.clear();
        }
    }));

    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent((customEvent) => {
        const t = customEvent.session ? customEvent.session.type : undefined;
        if (t === "java") {
            if (customEvent.event === "hotCodeReplace" && !suppressedReasons.has(customEvent.body.message)) {
                vscode.window.showInformationMessage(`Hot code replace failed - ${customEvent.body.message}`, NOT_SHOW_AGAIN).then((res) => {
                    if (res === NOT_SHOW_AGAIN) {
                        suppressedReasons.add(customEvent.body.message);
                    }
                });
            }
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((e) => {
        if (e.languageId === "java") {
            runningSessions.forEach((session) => {
                return session.customRequest("saveDocument", { documentUri: e.uri.toString() }).then(() => {
                }, () => { });
            });
        }
    }));
}
