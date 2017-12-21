// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const suppressedReasons: Set<string> = new Set();

const NOT_SHOW_AGAIN: string = "Not show again";

const JAVA_LANGID: string = "java";

const HCR_EVENT = "hotCodeReplace";

enum HcrEventType {
    ERROR = "ERROR",
    WARNING = "WARNING",
    STARTING = "STARTING",
    END = "END",
}

export function startHotCodeReplace(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession((session) => {
        const t = session ? session.type : undefined;
        if (t === JAVA_LANGID) {
            suppressedReasons.clear();
        }
    }));

    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent((customEvent) => {
        const t = customEvent.session ? customEvent.session.type : undefined;
        if (t === JAVA_LANGID) {
            if (customEvent.event === HCR_EVENT) {
                if (customEvent.body.eventType === HcrEventType.ERROR || customEvent.body.eventType === HcrEventType.WARNING) {
                    if (!suppressedReasons.has(customEvent.body.message)) {
                        vscode.window.showInformationMessage(`Hot code replace failed - ${customEvent.body.message}`, NOT_SHOW_AGAIN).then((res) => {
                            if (res === NOT_SHOW_AGAIN) {
                                suppressedReasons.add(customEvent.body.message);
                            }
                        });
                    }
                } else {
                    if (customEvent.body.eventType === HcrEventType.STARTING) {
                        vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, (p) => {
                            p.report({ message: customEvent.body.message });
                            return new Promise((resolve, reject) => {
                                const listener = vscode.debug.onDidReceiveDebugSessionCustomEvent((hcrEvent) => {
                                    p.report({ message: hcrEvent.body.message });
                                    if (hcrEvent.body.eventType === HcrEventType.END) {
                                        listener.dispose();
                                        resolve();
                                    }
                                });
                            });
                        });
                    }
                }
            }
        }
    }));
}
