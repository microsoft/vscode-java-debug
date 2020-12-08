// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

export function initializeThreadOperations(context: vscode.ExtensionContext) {
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("java.debug.continueAll", async (threadId) => {
        await operateThread("continueAll", threadId);
    }));

    context.subscriptions.push(instrumentOperationAsVsCodeCommand("java.debug.continueOthers", async (threadId) => {
        await operateThread("continueOthers", threadId);
    }));

    context.subscriptions.push(instrumentOperationAsVsCodeCommand("java.debug.pauseAll", async (threadId) => {
        await operateThread("pauseAll", threadId);
    }));

    context.subscriptions.push(instrumentOperationAsVsCodeCommand("java.debug.pauseOthers", async (threadId) => {
        await operateThread("pauseOthers", threadId);
    }));
}

async function operateThread(request: string, threadId: any): Promise<void> {
    const debugSession: vscode.DebugSession | undefined = vscode.debug.activeDebugSession;
    if (!debugSession) {
        return;
    }

    if (debugSession.configuration.noDebug) {
        return;
    }

    await debugSession.customRequest(request, { threadId });
}
