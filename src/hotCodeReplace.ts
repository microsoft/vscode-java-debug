// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const runningSessions: Set<vscode.DebugSession> = new Set();

const suppressedReasons: Set<string> = new Set();

const NOT_SHOW_AGAIN: string = "Not show again";

const JAVA_LANGID: string = "java";

const HCR_EVENT = "hotCodeReplace";

const SAVEDOCUMENT_EVENT = "saveDocument";

export function startHotCodeReplace(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.debug.onDidStartDebugSession((session) => {
        const t = session ? session.type : undefined;
        if (t === JAVA_LANGID) {
            runningSessions.add(session);
        }
    }));

    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession((session) => {
        const t = session ? session.type : undefined;
        if (t === JAVA_LANGID) {
            runningSessions.delete(session);
            suppressedReasons.clear();
        }
    }));

    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent((customEvent) => {
        const t = customEvent.session ? customEvent.session.type : undefined;
        if (t === JAVA_LANGID) {
            if (customEvent.event === HCR_EVENT && !suppressedReasons.has(customEvent.body.message)) {
                vscode.window.showInformationMessage(`Hot code replace failed - ${customEvent.body.message}`, NOT_SHOW_AGAIN).then((res) => {
                    if (res === NOT_SHOW_AGAIN) {
                        suppressedReasons.add(customEvent.body.message);
                    }
                });
            }
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((e) => {
        if (e.languageId === JAVA_LANGID) {
            runningSessions.forEach((session) => {
                return session.customRequest(SAVEDOCUMENT_EVENT, { documentUri: e.uri.toString() }).then(() => {
                }, () => { });
            });
        }
    }));
}
