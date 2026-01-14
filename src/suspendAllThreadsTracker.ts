// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export class SuspendAllThreadsTracker implements vscode.DebugAdapterTracker {
    public onDidSendMessage(message: any): void {
        if (message.type === "event" && message.event === "stopped") {
            const config = vscode.workspace.getConfiguration("java.debug.settings");
            if (config.get("suspendAllThreads") && !message.body.allThreadsStopped) {
                const reason = message.body.reason;
                if (reason === "breakpoint" || reason === "exception" || reason === "step") {
                    vscode.debug.activeDebugSession?.customRequest("pauseAll", { threadId: message.body.threadId });
                }
            }
        }
    }

    public onWillReceiveMessage(message: any): void {
        if (message.type === "request") {
            const config = vscode.workspace.getConfiguration("java.debug.settings");
            if (config.get("suspendAllThreads")) {
                if (message.command === "continue" || message.command === "next" || message.command === "stepIn" || message.command === "stepOut") {
                    const threadId = message.arguments?.threadId;
                    if (threadId !== undefined) {
                        vscode.debug.activeDebugSession?.customRequest("continueOthers", { threadId });
                    }
                }
            }
        }
    }
}
