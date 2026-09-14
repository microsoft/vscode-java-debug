// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { sendError } from "vscode-extension-telemetry-wrapper";
import { getJavaExtensionAPI } from "./utility";

export type JavaServerReadinessState =
    | { status: "initializing" | "ready" | "disposed" }
    | { status: "failed"; message: string };

export interface JavaServerReadiness extends vscode.Disposable {
    getState(): JavaServerReadinessState;
}

interface JavaServerAPI {
    readonly status?: string;
    readonly serverReady?: () => Thenable<boolean>;
}

const INITIALIZATION_FAILED = "Java language server initialization failed. "
    + "Check the Java language server logs, resolve the startup problem, and reload VS Code before retrying.";

export function observeJavaServerReadiness(): JavaServerReadiness {
    let state: JavaServerReadinessState = { status: "initializing" };
    let javaApi: JavaServerAPI | undefined;
    let disposed = false;

    function reportFailure(message: string): void {
        if (disposed) {
            return;
        }
        state = { status: "failed", message };
        // Activation errors may contain user paths; only report controlled messages.
        sendError({ name: "JavaServerReadinessError", message });
    }

    async function initialize(): Promise<void> {
        const api: JavaServerAPI | undefined = await getJavaExtensionAPI();
        if (disposed) {
            return;
        }
        if (!api || typeof api.serverReady !== "function") {
            reportFailure("Java language server readiness API is unavailable. "
                + "Update Language Support for Java by Red Hat and reload VS Code before retrying.");
            return;
        }
        javaApi = api;
        const ready = await api.serverReady();
        if (disposed) {
            return;
        }
        if (!ready) {
            reportFailure(INITIALIZATION_FAILED);
            return;
        }
        state = { status: "ready" };
    }

    void initialize().catch(() => reportFailure(INITIALIZATION_FAILED));

    return {
        getState() {
            // serverReady() is a success signal and need not reject on a server error.
            if (!disposed && javaApi?.status === "Error") {
                return { status: "failed", message: INITIALIZATION_FAILED };
            }
            if (!disposed && javaApi?.status === "Stopping") {
                return { status: "initializing" };
            }
            return state;
        },
        dispose() {
            disposed = true;
            state = { status: "disposed" };
        },
    };
}
