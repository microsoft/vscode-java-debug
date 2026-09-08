// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import * as telemetry from "vscode-extension-telemetry-wrapper";

import { ENABLE_NO_CONFIG_DEBUG } from "../src/constants";
import * as experimentation from "../src/experimentationService";
import { activate } from "../src/extension";
import * as languageModelTools from "../src/languageModelTool";
import * as chatTelemetry from "../src/lmToolTelemetry";
import * as noConfigDebug from "../src/noConfigDebugInit";
import { deferred } from "./helpers/deferred";
import { createFakeCollection } from "./helpers/environmentVariableCollection";

suite("No-Config Debug activation", () => {
    const restores: (() => void)[] = [];

    function stub(target: object, key: string, value: unknown): void {
        const descriptor = Object.getOwnPropertyDescriptor(target, key);
        assert.ok(descriptor, `Expected an existing export: ${key}`);
        Object.defineProperty(target, key, { ...descriptor, value });
        restores.push(() => Object.defineProperty(target, key, descriptor!));
    }

    teardown(() => {
        for (const restore of restores.splice(0).reverse()) {
            restore();
        }
    });

    const cases: { name: string; enabled: boolean; status: "ready" | "disposed" | "disabled" }[] = [
        { name: "returns the core API before optional startup completes", enabled: true, status: "ready" },
        { name: "owns the pending registration before disposal", enabled: true, status: "disposed" },
        { name: "forwards the disabled snapshot and still registers the other AI tools", enabled: false, status: "disabled" },
    ];

    for (const testCase of cases) {
        test(testCase.name, async () => {
            const events: string[] = [];
            const coreStarted = deferred<void>();
            const coreFinished = deferred<void>();
            const startup = deferred<noConfigDebug.NoConfigDebugResult>();
            const context = createContext();
            const api = { progressProvider: {} };
            const coreDisposable = new vscode.Disposable(() => events.push("core:dispose"));
            const launchDisposable = new vscode.Disposable(() => events.push("launch-tool:dispose"));
            const debugDisposable = new vscode.Disposable(() => events.push("debug-tools:dispose"));
            let readySettled = false;
            let disposed = false;
            const registration: noConfigDebug.NoConfigDebugRegistration = {
                ready: startup.promise.then((result) => {
                    readySettled = true;
                    events.push(`no-config:${result.status}`);
                    return result;
                }),
                async waitUntilReady() {
                    assert.fail("Activation must not wait for No-Config Debug readiness");
                },
                dispose() {
                    if (!disposed) {
                        disposed = true;
                        events.push("no-config:dispose");
                        startup.resolve({ status: "disposed" });
                    }
                },
            };

            stub(telemetry, "initializeFromJsonFile", async (packagePath: string) => {
                assert.strictEqual(packagePath, path.join(context.extensionPath, "package.json"));
                events.push("telemetry");
            });
            stub(experimentation, "initExpService", async (actualContext: vscode.ExtensionContext) => {
                assert.strictEqual(actualContext, context);
                events.push("experimentation");
            });
            stub(vscode.workspace, "getConfiguration", () => ({
                get(setting: string, defaultValue: boolean) {
                    assert.strictEqual(setting, ENABLE_NO_CONFIG_DEBUG);
                    assert.strictEqual(defaultValue, true);
                    events.push("snapshot");
                    return testCase.enabled;
                },
            }));
            stub(telemetry, "instrumentOperation", (name: string, initialize: (id: string, ctx: vscode.ExtensionContext) => unknown) => {
                assert.strictEqual(name, "activation");
                assert.strictEqual(initialize.name, "initializeExtension");
                events.push("instrument:activation");
                return async (actualContext: vscode.ExtensionContext) => {
                    assert.strictEqual(actualContext, context);
                    events.push("core:start");
                    coreStarted.resolve();
                    await coreFinished.promise;
                    context.subscriptions.push(coreDisposable);
                    events.push("core:complete");
                    return api;
                };
            });
            stub(noConfigDebug, "registerNoConfigDebug", (
                collection: vscode.EnvironmentVariableCollection,
                extensionPath: string,
                storageUri: vscode.Uri | undefined,
                enabled: boolean,
            ) => {
                assert.strictEqual(collection, context.environmentVariableCollection);
                assert.strictEqual(extensionPath, context.extensionPath);
                assert.strictEqual(storageUri, context.storageUri);
                assert.strictEqual(enabled, testCase.enabled);
                assert.deepStrictEqual(context.subscriptions, [coreDisposable]);
                events.push("no-config:start");
                return registration;
            });
            stub(vscode.extensions, "getExtension", (id: string) => {
                assert.strictEqual(id, "redhat.java");
                events.push("java:lookup");
                return createExtension(id, context.extensionPath);
            });
            stub(vscode.lm, "registerTool", () => {
                assert.fail("The activation test must not register real language model tools");
            });
            stub(languageModelTools, "registerLanguageModelTool", (
                actualContext: vscode.ExtensionContext,
                actualRegistration: noConfigDebug.NoConfigDebugRegistration,
            ) => {
                assert.strictEqual(actualContext, context);
                assert.strictEqual(actualRegistration, registration);
                assert.deepStrictEqual(context.subscriptions, [coreDisposable, registration]);
                assert.strictEqual(readySettled, false);
                events.push("launch-tool:register");
                context.subscriptions.push(launchDisposable);
                return launchDisposable;
            });
            stub(languageModelTools, "registerDebugSessionTools", (actualContext: vscode.ExtensionContext) => {
                assert.strictEqual(actualContext, context);
                assert.strictEqual(readySettled, false);
                events.push("debug-tools:register");
                return [debugDisposable];
            });
            stub(chatTelemetry, "recordChatActivation", () => events.push("chat:telemetry"));

            const activation = activate(context);
            try {
                await withinDeadline(coreStarted.promise, "Core initialization did not start");
                assert.deepStrictEqual(events, [
                    "telemetry", "experimentation", "snapshot", "instrument:activation", "core:start",
                ]);
                assert.strictEqual(context.subscriptions.length, 0);
                coreFinished.resolve();

                assert.strictEqual(await withinDeadline(activation, "Activation waited for optional startup"), api);
                assert.strictEqual(readySettled, false, "No-Config readiness must still be genuinely pending");
                assert.strictEqual(disposed, false);
                assert.deepStrictEqual(events, [
                    "telemetry", "experimentation", "snapshot", "instrument:activation", "core:start",
                    "core:complete", "no-config:start", "java:lookup", "launch-tool:register",
                    "debug-tools:register", "chat:telemetry",
                ]);
                assert.deepStrictEqual(context.subscriptions, [coreDisposable, registration, launchDisposable, debugDisposable]);

                if (testCase.status === "disposed") {
                    for (const disposable of context.subscriptions.splice(0)) {
                        disposable.dispose();
                    }
                    assert.strictEqual(disposed, true);
                } else {
                    startup.resolve({ status: testCase.status });
                }
                assert.deepStrictEqual(await withinDeadline(registration.ready, "Startup did not settle"), { status: testCase.status });
                assert.strictEqual(readySettled, true);
            } finally {
                // Release both gates even when a regression makes activation await optional startup.
                coreFinished.resolve();
                startup.resolve({ status: "disposed" });
                try {
                    await withinDeadline(activation, "Activation did not settle during cleanup");
                } finally {
                    for (const disposable of context.subscriptions.splice(0).reverse()) {
                        disposable.dispose();
                    }
                    registration.dispose();
                }
            }
        });
    }
});

async function withinDeadline<T>(promise: Promise<T>, message: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => reject(new Error(message)), 500);
            }),
        ]);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

function createExtension(id: string, extensionPath: string): vscode.Extension<never> {
    return {
        id,
        extensionPath,
        extensionUri: vscode.Uri.file(extensionPath),
        isActive: false,
        packageJSON: { version: "test" },
        extensionKind: vscode.ExtensionKind.Workspace,
        get exports(): never { throw new Error("Unexpected extension exports access"); },
        activate(): never { throw new Error("The test must not activate a real Java extension"); },
    };
}

function createContext(): vscode.ExtensionContext {
    const extensionPath = path.resolve(__dirname, "../..");
    const collection = createFakeCollection();
    return {
        subscriptions: [],
        extensionPath,
        extensionUri: vscode.Uri.file(extensionPath),
        storageUri: vscode.Uri.file(path.join(extensionPath, ".activation-test-storage")),
        environmentVariableCollection: { ...collection, getScoped: () => collection },
        extensionMode: vscode.ExtensionMode.Test,
        extension: createExtension("vscjava.vscode-java-debug", extensionPath),
        asAbsolutePath: (relativePath) => path.join(extensionPath, relativePath),
        get workspaceState(): never { throw new Error("Unexpected workspace state access"); },
        get globalState(): never { throw new Error("Unexpected global state access"); },
        get secrets(): never { throw new Error("Unexpected secrets access"); },
        get storagePath(): never { throw new Error("Unexpected storage path access"); },
        get globalStorageUri(): never { throw new Error("Unexpected global storage URI access"); },
        get globalStoragePath(): never { throw new Error("Unexpected global storage path access"); },
        get logUri(): never { throw new Error("Unexpected log URI access"); },
        get logPath(): never { throw new Error("Unexpected log path access"); },
        get languageModelAccessInformation(): never { throw new Error("Unexpected language model access information"); },
    };
}
