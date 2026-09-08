// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as telemetry from "vscode-extension-telemetry-wrapper";

import { ENABLE_NO_CONFIG_DEBUG } from "../src/constants";
import { registerLanguageModelTool } from "../src/languageModelTool";
import { NoConfigDebugRegistration, NoConfigDebugWaitResult } from "../src/noConfigDebugInit";
import { deferred } from "./helpers/deferred";

suite("No-Config Debug setting", () => {
    test("is a default-enabled window-scoped setting with localized descriptions", async () => {
        const repoRoot = path.resolve(__dirname, "../..");
        const manifest = JSON.parse(await fs.promises.readFile(path.join(repoRoot, "package.json"), "utf8"));
        const setting = manifest.contributes.configuration.properties[ENABLE_NO_CONFIG_DEBUG];
        assert.strictEqual(setting.type, "boolean");
        assert.strictEqual(setting.default, true);
        assert.strictEqual(setting.scope, "window");
        assert.strictEqual(vscode.workspace.getConfiguration().inspect<boolean>(ENABLE_NO_CONFIG_DEBUG)?.defaultValue, true);

        const descriptionKey = "java.debugger.configuration.enableNoConfigDebug.description";
        assert.strictEqual(setting.description, `%${descriptionKey}%`);
        for (const file of ["package.nls.json", "package.nls.zh-cn.json", "package.nls.zh-tw.json", "package.nls.es.json", "package.nls.it.json"]) {
            const translations = JSON.parse(await fs.promises.readFile(path.join(repoRoot, file), "utf8"));
            assert.strictEqual(typeof translations[descriptionKey], "string", file);
            assert.ok(translations[descriptionKey].includes("debugjava"), file);
        }
    });
});

suite("No-Config Debug AI startup readiness", () => {
    let registeredTool: vscode.LanguageModelTool<unknown> | undefined;
    let registeredName: string | undefined;
    let cleanups: (() => void)[];
    let cancellation: vscode.CancellationTokenSource;
    let waitedTokens: vscode.CancellationToken[];
    let inputReads: number;
    let telemetryCalls: number;
    let sideEffects: number;

    function overrideProperty(target: object, key: string, descriptor: PropertyDescriptor): void {
        const original = Object.getOwnPropertyDescriptor(target, key);
        assert.ok(original);
        Object.defineProperty(target, key, { configurable: true, ...descriptor });
        cleanups.push(() => Object.defineProperty(target, key, original));
    }

    function registerReadiness(result: NoConfigDebugWaitResult | Promise<NoConfigDebugWaitResult>): vscode.LanguageModelTool<unknown> {
        const readiness: Pick<NoConfigDebugRegistration, "waitUntilReady"> = {
            async waitUntilReady(token) {
                waitedTokens.push(token);
                return result;
            },
        };
        const context: Pick<vscode.ExtensionContext, "subscriptions"> = { subscriptions: [] };
        const disposable = registerLanguageModelTool(context, readiness);
        assert.ok(disposable);
        cleanups.push(() => disposable.dispose());
        assert.strictEqual(context.subscriptions[0], disposable);
        assert.strictEqual(registeredName, "debug_java_application");
        assert.ok(registeredTool);
        return registeredTool;
    }

    function resultText(result: unknown): string {
        assert.ok(result instanceof vscode.LanguageModelToolResult);
        assert.strictEqual(result.content.length, 1);
        const text = result.content[0];
        assert.ok(text instanceof vscode.LanguageModelTextPart);
        return text.value;
    }

    function assertWaitedWithInvocationToken(): void {
        assert.strictEqual(waitedTokens.length, 1);
        assert.strictEqual(waitedTokens[0], cancellation.token);
    }

    function assertNoLaunchWork(): void {
        assert.strictEqual(inputReads, 0);
        assert.strictEqual(telemetryCalls, 0);
        assert.strictEqual(sideEffects, 0);
    }

    async function invokeBlockedTool(readiness: NoConfigDebugWaitResult): Promise<string> {
        const tool = registerReadiness(readiness);
        const result = await tool.invoke({
            get input(): never {
                inputReads += 1;
                throw new Error("The launch tool must not inspect inputs before initialization is ready");
            },
            toolInvocationToken: undefined,
        }, cancellation.token);
        assertWaitedWithInvocationToken();
        assertNoLaunchWork();
        const text = resultText(result);
        assert.ok(text.includes("Standard Java launch/attach debugging remains available"));
        return text;
    }

    setup(() => {
        registeredTool = undefined;
        registeredName = undefined;
        cleanups = [];
        cancellation = new vscode.CancellationTokenSource();
        cleanups.push(() => cancellation.dispose());
        waitedTokens = [];
        inputReads = 0;
        telemetryCalls = 0;
        sideEffects = 0;
        const registerTool: typeof vscode.lm.registerTool = (name, tool) => {
            registeredName = name;
            registeredTool = tool;
            return new vscode.Disposable(() => { });
        };
        overrideProperty(vscode.lm, "registerTool", { value: registerTool });
        const recordTelemetry = () => { telemetryCalls += 1; };
        overrideProperty(telemetry, "sendInfo", { value: recordTelemetry });
        overrideProperty(telemetry, "sendError", { value: recordTelemetry });
        const unexpectedSideEffect = (): never => {
            sideEffects += 1;
            throw new Error("The AI launch tool must not touch sessions, terminals, or builds before readiness or after cancellation");
        };
        overrideProperty(vscode.debug, "activeDebugSession", { get: unexpectedSideEffect });
        overrideProperty(vscode.debug, "startDebugging", { value: unexpectedSideEffect });
        overrideProperty(vscode.debug, "stopDebugging", { value: unexpectedSideEffect });
        overrideProperty(vscode.window, "terminals", { get: unexpectedSideEffect });
        overrideProperty(vscode.window, "createTerminal", { value: unexpectedSideEffect });
        overrideProperty(vscode.commands, "executeCommand", { value: unexpectedSideEffect });
    });

    teardown(() => {
        for (const cleanup of cleanups.reverse()) {
            cleanup();
        }
    });

    test("returns disabled snapshot guidance without rereading settings, inspecting inputs, or doing launch work", async () => {
        overrideProperty(vscode.workspace, "getConfiguration", {
            value: () => {
                throw new Error("The launch tool must use the activation snapshot instead of reading live settings");
            },
        });

        const text = await invokeBlockedTool({ status: "disabled" });
        assert.ok(text.includes(ENABLE_NO_CONFIG_DEBUG));
        assert.ok(text.includes("enable that setting"));
        assert.ok(text.includes("reload VS Code"));
        assert.ok(text.includes("recreate existing terminals"));
    });

    test("waits for pending readiness before inspecting inputs, emitting telemetry, or doing launch work", async () => {
        const readiness = deferred<NoConfigDebugWaitResult>();
        cleanups.push(() => readiness.resolve({ status: "disposed" }));
        const tool = registerReadiness(readiness.promise);
        let targetReads = 0;
        const input = {
            get target(): string {
                targetReads += 1;
                return "Main";
            },
            workspacePath: "unused",
        };
        const invocation = Promise.resolve(tool.invoke({
            get input() {
                inputReads += 1;
                return input;
            },
            toolInvocationToken: undefined,
        }, cancellation.token));
        let settled = false;
        void invocation.then(() => { settled = true; }, () => { settled = true; });
        await Promise.resolve();

        assertWaitedWithInvocationToken();
        assert.strictEqual(settled, false);
        assert.strictEqual(targetReads, 0);
        assertNoLaunchWork();

        cancellation.cancel();
        readiness.resolve({ status: "ready" });
        const text = resultText(await invocation);
        assert.ok(text.includes("Operation cancelled by user"));
        assert.ok(inputReads > 0);
        assert.ok(targetReads > 0);
        assert.ok(telemetryCalls > 0);
        assert.strictEqual(sideEffects, 0);
    });

    test("returns initialization error and recovery guidance without doing launch work", async () => {
        const message = "Java No-Config Debug initialization failed (EACCES).";
        const text = await invokeBlockedTool({ status: "failed", message });
        assert.ok(text.includes(message));
        assert.ok(text.includes("cannot launch until initialization succeeds"));
        assert.ok(text.includes("Resolve the initialization problem and reload VS Code"));
        assert.strictEqual(text.includes("enable that setting"), false);
    });

    test("returns cancellation while waiting without inspecting inputs or doing launch work", async () => {
        cancellation.cancel();
        const text = await invokeBlockedTool({ status: "cancelled" });
        assert.ok(text.includes("Operation cancelled by user while waiting"));
        assert.strictEqual(text.includes("enable that setting"), false);
    });

    test("returns retry guidance on readiness timeout without doing launch work", async () => {
        const text = await invokeBlockedTool({ status: "timeout" });
        assert.ok(text.includes("Timed out waiting for Java No-Config Debug initialization"));
        assert.ok(text.includes("Initialization is still running"));
        assert.ok(text.includes("retry this tool later"));
        assert.strictEqual(text.includes("enable that setting"), false);
    });

    test("returns reload guidance when initialization is disposed without doing launch work", async () => {
        const text = await invokeBlockedTool({ status: "disposed" });
        assert.ok(text.includes("has been disposed"));
        assert.ok(text.includes("Reload VS Code before retrying this tool"));
        assert.strictEqual(text.includes("enable that setting"), false);
    });

    test("continues the existing launch flow when readiness succeeds", async () => {
        const tool = registerReadiness({ status: "ready" });
        cancellation.cancel();

        const result = await tool.invoke({
            input: { target: "Main", workspacePath: "unused" },
            toolInvocationToken: undefined,
        }, cancellation.token);
        assertWaitedWithInvocationToken();
        const text = resultText(result);
        assert.ok(text.includes("Operation cancelled by user"));
        assert.strictEqual(text.includes(ENABLE_NO_CONFIG_DEBUG), false);
        assert.ok(telemetryCalls > 0);
        assert.strictEqual(sideEffects, 0);
    });
});
