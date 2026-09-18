// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as telemetry from "vscode-extension-telemetry-wrapper";

import { registerLanguageModelTool } from "../src/languageModelTool";

suite("Language Model Tool launch retry policy", () => {
    const repoRoot = path.resolve(__dirname, "../..");
    let cleanups: (() => void)[];
    let registeredTool: vscode.LanguageModelTool<unknown> | undefined;
    let commandsSent: number;
    let terminalsClosed: number;
    let sessionsStopped: number;
    let listenerDisposals: number;
    let detectSession: boolean;
    let sessionListener: ((session: { id: string; type: string }) => void) | undefined;
    let records: { [key: string]: string }[];

    function overrideProperty(target: object, key: string, descriptor: PropertyDescriptor): void {
        const original = Object.getOwnPropertyDescriptor(target, key);
        assert.ok(original, key);
        Object.defineProperty(target, key, { configurable: true, ...descriptor });
        cleanups.push(() => Object.defineProperty(target, key, original));
    }

    setup(() => {
        cleanups = [];
        registeredTool = undefined;
        commandsSent = 0;
        terminalsClosed = 0;
        sessionsStopped = 0;
        listenerDisposals = 0;
        detectSession = false;
        sessionListener = undefined;
        records = [];

        const registerTool: typeof vscode.lm.registerTool = (_name, tool) => {
            registeredTool = tool;
            return new vscode.Disposable(() => { });
        };
        overrideProperty(vscode.lm, "registerTool", { value: registerTool });
        overrideProperty(telemetry, "sendInfo", {
            value: (_operationId: string, properties: { [key: string]: string }) => records.push(properties),
        });
        overrideProperty(vscode.debug, "activeDebugSession", {
            get: () => detectSession && commandsSent > 0 ? { id: "test-session", type: "java" } : undefined,
        });
        overrideProperty(vscode.debug, "stopDebugging", {
            value: async () => { sessionsStopped++; },
        });
        overrideProperty(vscode.window, "terminals", { get: () => [] });
        overrideProperty(vscode.workspace, "getWorkspaceFolder", { value: () => undefined });
        overrideProperty(vscode.debug, "onDidStartDebugSession", {
            value: (listener: typeof sessionListener) => {
                sessionListener = listener;
                return new vscode.Disposable(() => {
                    listenerDisposals++;
                    sessionListener = undefined;
                });
            },
        });
        overrideProperty(vscode.window, "createTerminal", {
            value: () => ({
                name: "Java Debug",
                show: () => { },
                dispose: () => { terminalsClosed++; },
                sendText: () => {
                    commandsSent++;
                    if (detectSession) {
                        queueMicrotask(() => sessionListener?.({ id: "test-session", type: "java" }));
                    }
                },
            }),
        });

        // Advance only launch waits; keep Mocha and VS Code timers on the real clock.
        let now = Date.now();
        const realSetTimeout = global.setTimeout;
        overrideProperty(Date, "now", { value: () => now });
        overrideProperty(global, "setTimeout", {
            value: (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
                if (delay === 300 || delay === 120000) {
                    return realSetTimeout(() => {
                        now += delay === 300 ? 90000 : delay;
                        callback(...args);
                    }, 0);
                }
                return realSetTimeout(callback, delay, ...args);
            },
        });
    });

    teardown(() => {
        for (const cleanup of cleanups.reverse()) {
            cleanup();
        }
    });

    async function invoke(input: object, enabled = true): Promise<string> {
        const disposable = registerLanguageModelTool({ subscriptions: [] }, enabled);
        assert.ok(disposable);
        cleanups.push(() => disposable.dispose());
        assert.ok(registeredTool);
        const cancellation = new vscode.CancellationTokenSource();
        cleanups.push(() => cancellation.dispose());
        const result = await registeredTool.invoke({ input, toolInvocationToken: undefined }, cancellation.token);
        assert.ok(result instanceof vscode.LanguageModelToolResult);
        const text = result.content[0];
        assert.ok(text instanceof vscode.LanguageModelTextPart);
        return text.value;
    }

    function assertNoAutomaticRetry(text: string): void {
        assert.ok(text.includes("Do not automatically retry debug_java_application"));
        assert.ok(text.includes("or start the program again through a terminal command"));
        assert.ok(text.includes("after fixing an identified cause or when the user explicitly requests a retry"));
        assert.ok(text.includes("check whether the original launch has become active"));
        assert.strictEqual(text.includes("most timeout cases recover on retry"), false);
        assert.strictEqual(text.includes("Call debug_java_application again"), false);
    }

    for (const waitForSession of [false, true]) {
        test(`reports unconfirmed startup without relaunching (waitForSession=${waitForSession})`, async () => {
            const text = await invoke({
                target: "com.example.Main", workspacePath: repoRoot,
                skipBuild: true, classpath: repoRoot, waitForSession,
            });

            assertNoAutomaticRetry(text);
            assert.ok(text.includes("Startup is unconfirmed, not necessarily failed"));
            assert.ok(text.includes("check get_debug_session_info once"));
            assert.ok(text.includes("do not enter a polling loop or stop the original launch"));
            assert.strictEqual(text.includes("\u2713"), false);
            assert.strictEqual(commandsSent, 1);
            assert.strictEqual(terminalsClosed, 0);
            assert.strictEqual(sessionsStopped, 0);
            assert.strictEqual(listenerDisposals, waitForSession ? 1 : 0);
            const outcomes = records.filter((record) => record.operationName === "languageModelTool.debug_java_application.invoke");
            assert.strictEqual(outcomes.length, 1);
            assert.strictEqual(outcomes[0].outcome, "timeout");
            assert.strictEqual(outcomes[0].errorCategory, "timeout");
        });

        test(`preserves confirmed startup (waitForSession=${waitForSession})`, async () => {
            detectSession = true;
            const text = await invoke({
                target: "com.example.Main", workspacePath: repoRoot,
                skipBuild: true, classpath: repoRoot, waitForSession,
            });

            assert.ok(text.includes("Debug session started"));
            assert.strictEqual(text.includes("Do not automatically retry"), false);
            assert.strictEqual(commandsSent, 1);
            assert.strictEqual(terminalsClosed, 0);
            assert.strictEqual(sessionsStopped, 0);
            assert.strictEqual(listenerDisposals, waitForSession ? 1 : 0);
            assert.ok(records.some((record) =>
                record.operationName === "languageModelTool.debug_java_application.invoke" && record.outcome === "success"));
        });
    }

    test("includes the policy on a returned launch failure", async () => {
        const text = await invoke({
            target: "com.example.Main", workspacePath: path.join(repoRoot, "package.json", "not-a-directory"),
            skipBuild: true,
        });
        assert.ok(text.includes("Workspace path does not exist"));
        assertNoAutomaticRetry(text);
        assert.strictEqual(commandsSent, 0);
    });

    test("includes the policy on an exception", async () => {
        overrideProperty(vscode.window, "createTerminal", {
            value: () => { throw new Error("Terminal creation failed"); },
        });
        const text = await invoke({
            target: "com.example.Main", workspacePath: repoRoot, skipBuild: true, classpath: repoRoot,
        });
        assert.ok(text.includes("Terminal creation failed"));
        assertNoAutomaticRetry(text);
        assert.strictEqual(commandsSent, 0);
    });

    test("includes the policy when no-config debugging is disabled", async () => {
        const text = await invoke({}, false);
        assert.ok(text.includes("Java No-Config Debug is disabled"));
        assertNoAutomaticRetry(text);
        assert.strictEqual(commandsSent, 0);
    });

    test("keeps model-facing guidance consistent without requiring a skill to be loaded", async () => {
        const manifest = JSON.parse(await fs.promises.readFile(path.join(repoRoot, "package.json"), "utf8"));
        const launchTool = manifest.contributes.languageModelTools.find((tool: { name: string }) =>
            tool.name === "debug_java_application");
        assert.ok(launchTool.modelDescription.includes("After the first failure or timeout, do not automatically retry"));
        assert.ok(launchTool.modelDescription.includes("or relaunch through terminal commands"));
        assert.ok(launchTool.modelDescription.includes("explicit user retry request"));

        for (const file of [
            path.join("resources", "instruments", "javaDebugContext.instructions.md"),
            path.join("resources", "skills", "java-launch-troubleshooting", "SKILL.md"),
            path.join("resources", "skills", "java-debug-inspection", "SKILL.md"),
        ]) {
            const text = await fs.promises.readFile(path.join(repoRoot, file), "utf8");
            assert.match(text, /[Aa]fter the first/, file);
            assert.match(text, /polling loop/, file);
            assert.match(text, /explicit(?:ly requests a retry| user retry request)/, file);
            assert.doesNotMatch(text, /repeats the same error twice|Do not retry (?:the debug tool )?more than twice/, file);
        }
    });
});
