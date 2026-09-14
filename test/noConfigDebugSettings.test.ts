// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as telemetry from "vscode-extension-telemetry-wrapper";

import { ENABLE_NO_CONFIG_DEBUG } from "../src/constants";
import * as javaServerReadiness from "../src/javaServerReadiness";
import { registerLanguageModelTool } from "../src/languageModelTool";
import { NoConfigDebugRegistration, NoConfigDebugState } from "../src/noConfigDebugInit";
import * as utility from "../src/utility";
import { deferred, withinDeadline } from "./helpers/deferred";

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

    test("documents fail-fast readiness without changing Java launch tool visibility", async () => {
        const repoRoot = path.resolve(__dirname, "../..");
        const manifest = JSON.parse(await fs.promises.readFile(path.join(repoRoot, "package.json"), "utf8"));
        const tool = manifest.contributes.languageModelTools.find((candidate: { name: string }) => candidate.name === "debug_java_application");
        assert.ok(tool);
        assert.strictEqual(tool.when, "javaLSReady");
        assert.strictEqual(typeof tool.modelDescription, "string");
        for (const code of ["JAVA_NOT_READY", "NO_CONFIG_NOT_READY"]) {
            assert.ok(tool.modelDescription.includes(code), code);
        }
    });
});

suite("No-Config Debug AI startup readiness", () => {
    const noChanges = " No build, terminal, or debug session changes were made.";
    const javaNotReady = "JAVA_NOT_READY: JDT LS is not ready. Wait for Java initialization to complete before retrying. "
        + "In Lightweight mode or with manual project import, switch to Standard mode or import the project first. "
        + "Do not retry in a loop or change project code to resolve this readiness condition.";
    const javaInitializationFailed = "JAVA_INIT_FAILED: Java language server initialization failed. "
        + "Check the Java language server logs, resolve the startup problem, and reload VS Code before retrying.";
    const toolDisposed = "NO_CONFIG_DISPOSED: The Java debug launch tool has been disposed. Reload VS Code before retrying.";
    const terminalStates: { state: NoConfigDebugState; message: string }[] = [
        {
            state: { status: "disabled" },
            message: `NO_CONFIG_DISABLED: Java No-Config Debug is disabled by ${ENABLE_NO_CONFIG_DEBUG}. `
                + "To use this tool, enable that setting, reload VS Code, and recreate existing terminals. "
                + "Standard Java launch/attach debugging remains available.",
        },
        {
            state: { status: "failed", message: "Java No-Config Debug initialization failed (EACCES)." },
            message: "NO_CONFIG_INIT_FAILED: Java No-Config Debug initialization failed (EACCES). "
                + "Resolve the initialization problem and reload VS Code before retrying. "
                + "Standard Java launch/attach debugging remains available.",
        },
        {
            state: { status: "disposed" },
            message: "NO_CONFIG_DISPOSED: Java No-Config Debug has been disposed. Reload VS Code before retrying this tool.",
        },
    ];

    interface TestJavaAPI {
        serverMode: utility.ServerMode;
        status: string;
        serverReady?: () => Thenable<boolean>;
    }

    let registeredTool: vscode.LanguageModelTool<unknown> | undefined;
    let registeredName: string | undefined;
    let lmRegistration: vscode.Disposable | undefined;
    let registrations: vscode.Disposable[];
    let cleanups: (() => void)[];
    let cancellation: vscode.CancellationTokenSource;
    let activation: ReturnType<typeof deferred<TestJavaAPI | undefined>>;
    let serverReady: ReturnType<typeof deferred<boolean>>;
    let javaApi: TestJavaAPI;
    let noConfigState: NoConfigDebugState;
    let apiCalls: number;
    let serverReadyCalls: number;
    let observerStarts: number;
    let observerDisposals: number;
    let lmDisposals: number;
    let noConfigStateReads: number;
    let javaStateReads: number;
    let inputReads: number;
    let targetReads: number;
    let javaVersionProbes: number;
    let launchTelemetry: Parameters<typeof telemetry.sendInfo>[];
    let errorTelemetry: Parameters<typeof telemetry.sendError>[];
    let sideEffects: number;

    function overrideProperty(target: object, key: string, descriptor: PropertyDescriptor): void {
        const original = Object.getOwnPropertyDescriptor(target, key);
        assert.ok(original);
        Object.defineProperty(target, key, { configurable: true, ...descriptor });
        cleanups.push(() => Object.defineProperty(target, key, original));
    }

    function nextTurn(): Promise<void> {
        return new Promise((resolve) => setImmediate(resolve));
    }

    function registerReadiness(state: NoConfigDebugState): {
        tool: vscode.LanguageModelTool<unknown>;
        disposable: vscode.Disposable;
    } {
        noConfigState = state;
        const readiness: Pick<NoConfigDebugRegistration, "getState"> = {
            getState() {
                noConfigStateReads += 1;
                return noConfigState;
            },
        };
        const context: Pick<vscode.ExtensionContext, "subscriptions"> = { subscriptions: [] };
        const disposable = registerLanguageModelTool(context, readiness);
        assert.ok(disposable);
        registrations.push(disposable);
        assert.strictEqual(context.subscriptions.length, 1);
        assert.strictEqual(context.subscriptions[0], disposable);
        assert.notStrictEqual(disposable, lmRegistration);
        assert.strictEqual(registeredName, "debug_java_application");
        assert.ok(registeredTool);
        return { tool: registeredTool, disposable };
    }

    function resultText(result: unknown): string {
        assert.ok(result instanceof vscode.LanguageModelToolResult);
        assert.strictEqual(result.content.length, 1);
        const text = result.content[0];
        assert.ok(text instanceof vscode.LanguageModelTextPart);
        return text.value;
    }

    function assertNoLaunchWork(): void {
        assert.strictEqual(inputReads, 0);
        assert.strictEqual(targetReads, 0);
        assert.strictEqual(javaVersionProbes, 0);
        assert.strictEqual(launchTelemetry.length, 0);
        assert.strictEqual(sideEffects, 0);
    }

    async function invokePromptly(
        tool: vscode.LanguageModelTool<unknown>,
        options: vscode.LanguageModelToolInvocationOptions<unknown>,
    ): Promise<string> {
        const startedAt = Date.now();
        const result = await withinDeadline(
            Promise.resolve(tool.invoke(options, cancellation.token)),
            "The invocation did not complete within 500 ms",
        );
        assert.ok(Date.now() - startedAt < 500, "The invocation must complete within 500 ms");
        return resultText(result);
    }

    async function invokeBlockedTool(tool: vscode.LanguageModelTool<unknown>): Promise<string> {
        const errorsBefore = errorTelemetry.slice();
        const text = await invokePromptly(tool, {
            get input(): never {
                inputReads += 1;
                throw new Error("The launch tool must not inspect inputs before initialization is ready");
            },
            toolInvocationToken: undefined,
        });
        assertNoLaunchWork();
        assert.deepStrictEqual(errorTelemetry, errorsBefore);
        return text;
    }

    async function invokeAndCancelAfterReadiness(tool: vscode.LanguageModelTool<unknown>): Promise<void> {
        const input = {
            get target(): string {
                targetReads += 1;
                cancellation.cancel();
                return "Main";
            },
            workspacePath: "unused",
        };
        const text = await invokePromptly(tool, {
            get input() {
                inputReads += 1;
                return input;
            },
            toolInvocationToken: undefined,
        });
        assert.strictEqual(text, "\u2717 Operation cancelled by user");
        assert.ok(inputReads > 0);
        assert.ok(targetReads > 0);
        assert.ok(launchTelemetry.length > 0);
        assert.strictEqual(errorTelemetry.length, 0);
        assert.strictEqual(sideEffects, 0);
    }

    setup(() => {
        registeredTool = undefined;
        registeredName = undefined;
        lmRegistration = undefined;
        registrations = [];
        cleanups = [];
        cancellation = new vscode.CancellationTokenSource();
        activation = deferred<TestJavaAPI | undefined>();
        serverReady = deferred<boolean>();
        javaApi = {
            serverMode: utility.ServerMode.STANDARD,
            status: "Started",
            serverReady() {
                serverReadyCalls += 1;
                return serverReady.promise;
            },
        };
        apiCalls = 0;
        serverReadyCalls = 0;
        observerStarts = 0;
        observerDisposals = 0;
        lmDisposals = 0;
        noConfigStateReads = 0;
        javaStateReads = 0;
        inputReads = 0;
        targetReads = 0;
        javaVersionProbes = 0;
        launchTelemetry = [];
        errorTelemetry = [];
        sideEffects = 0;
        const registerTool: typeof vscode.lm.registerTool = (name, tool) => {
            registeredName = name;
            registeredTool = tool;
            lmRegistration = new vscode.Disposable(() => { lmDisposals += 1; });
            return lmRegistration;
        };
        overrideProperty(vscode.lm, "registerTool", { value: registerTool });
        overrideProperty(utility, "getJavaExtensionAPI", {
            value: () => {
                apiCalls += 1;
                return activation.promise;
            },
        });
        const observe = javaServerReadiness.observeJavaServerReadiness;
        overrideProperty(javaServerReadiness, "observeJavaServerReadiness", {
            value: (): javaServerReadiness.JavaServerReadiness => {
                observerStarts += 1;
                assert.ok(registeredTool, "The LM implementation must be registered before Java initialization starts");
                const observer = observe();
                return {
                    getState() {
                        javaStateReads += 1;
                        return observer.getState();
                    },
                    dispose() {
                        observerDisposals += 1;
                        observer.dispose();
                    },
                };
            },
        });
        overrideProperty(telemetry, "sendInfo", {
            value: (...args: Parameters<typeof telemetry.sendInfo>) => { launchTelemetry.push(args); },
        });
        overrideProperty(telemetry, "sendError", {
            value: (...args: Parameters<typeof telemetry.sendError>) => { errorTelemetry.push(args); },
        });
        overrideProperty(vscode.extensions, "getExtension", {
            value: () => {
                javaVersionProbes += 1;
                return undefined;
            },
        });
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
        overrideProperty(vscode.tasks, "executeTask", { value: unexpectedSideEffect });
    });

    teardown(async () => {
        for (const registration of registrations.reverse()) {
            registration.dispose();
        }
        activation.resolve(undefined);
        serverReady.resolve(true);
        await nextTurn();
        cancellation.dispose();
        for (const cleanup of cleanups.reverse()) {
            cleanup();
        }
    });

    for (const { state, message } of terminalStates) {
        test(`preserves the ${state.status} snapshot without live settings or Java initialization`, async () => {
            overrideProperty(vscode.workspace, "getConfiguration", {
                value: () => {
                    throw new Error("The launch tool must use the activation snapshot instead of reading live settings");
                },
            });
            const { tool } = registerReadiness(state);

            assert.strictEqual(await invokeBlockedTool(tool), message + noChanges);
            assert.strictEqual(observerStarts, 0);
            assert.strictEqual(apiCalls, 0);
            assert.strictEqual(serverReadyCalls, 0);
            assert.strictEqual(javaStateReads, 0);
        });

        test(`prefers the current No-Config ${state.status} state over a Java initialization failure`, async () => {
            const { tool } = registerReadiness({ status: "initializing" });
            activation.reject(new Error("Private activation failure at C:\\private\\workspace"));
            await nextTurn();
            assert.strictEqual(errorTelemetry.length, 1);
            noConfigState = state;

            assert.strictEqual(await invokeBlockedTool(tool), message + noChanges);
            assert.strictEqual(observerStarts, 1);
            assert.strictEqual(apiCalls, 1);
        });
    }

    test("refuses pending Java activation promptly without restarting observation", async () => {
        const { tool } = registerReadiness({ status: "ready" });

        const results = await Promise.all([invokeBlockedTool(tool), invokeBlockedTool(tool)]);
        assert.deepStrictEqual(results, [javaNotReady + noChanges, javaNotReady + noChanges]);
        assert.strictEqual(observerStarts, 1);
        assert.strictEqual(apiCalls, 1);
        assert.strictEqual(serverReadyCalls, 0);
    });

    test("refuses pending serverReady despite Standard mode and Started status, without queueing a launch", async () => {
        const { tool } = registerReadiness({ status: "ready" });
        activation.resolve(javaApi);
        await nextTurn();

        assert.strictEqual(await invokeBlockedTool(tool), javaNotReady + noChanges);
        assert.strictEqual(serverReadyCalls, 1);
        serverReady.resolve(true);
        await nextTurn();
        assertNoLaunchWork();
        assert.strictEqual(observerStarts, 1);
        assert.strictEqual(apiCalls, 1);
        assert.strictEqual(serverReadyCalls, 1);
    });

    test("reports Java initialization failure instead of waiting for No-Config preparation", async () => {
        const { tool } = registerReadiness({ status: "initializing" });
        activation.reject(new Error("Private activation failure at C:\\private\\workspace"));
        await nextTurn();
        assert.strictEqual(errorTelemetry.length, 1);

        assert.strictEqual(await invokeBlockedTool(tool), javaInitializationFailed + noChanges);
        assert.strictEqual(serverReadyCalls, 0);
    });

    test("returns update guidance when the Java readiness API is missing", async () => {
        const { tool } = registerReadiness({ status: "ready" });
        activation.resolve({ serverMode: utility.ServerMode.STANDARD, status: "Started" });
        await nextTurn();
        assert.strictEqual(errorTelemetry.length, 1);

        assert.strictEqual(await invokeBlockedTool(tool),
            "JAVA_INIT_FAILED: Java language server readiness API is unavailable. "
            + "Update Language Support for Java by Red Hat and reload VS Code before retrying." + noChanges);
        assert.strictEqual(serverReadyCalls, 0);
    });

    test("checks current Java Error status even after serverReady succeeded", async () => {
        const { tool } = registerReadiness({ status: "ready" });
        activation.resolve(javaApi);
        serverReady.resolve(true);
        await nextTurn();
        javaApi.status = "Error";

        assert.strictEqual(await invokeBlockedTool(tool), javaInitializationFailed + noChanges);
    });

    for (const ready of [false, true]) {
        test(`pre-cancelled invocation bypasses inputs and readiness queries when Java is ${ready ? "ready" : "pending"}`, async () => {
            const { tool } = registerReadiness({ status: "ready" });
            if (ready) {
                activation.resolve(javaApi);
                serverReady.resolve(true);
                await nextTurn();
            }
            cancellation.cancel();
            const readsBefore = [noConfigStateReads, javaStateReads];

            assert.strictEqual(await invokeBlockedTool(tool), "CANCELLED: Operation cancelled by user." + noChanges);
            assert.deepStrictEqual([noConfigStateReads, javaStateReads], readsBefore);
        });
    }

    test("checks cancellation before registration disposal or readiness", async () => {
        const { tool, disposable } = registerReadiness({ status: "ready" });
        disposable.dispose();
        cancellation.cancel();
        const readsBefore = [noConfigStateReads, javaStateReads];

        assert.strictEqual(await invokeBlockedTool(tool), "CANCELLED: Operation cancelled by user." + noChanges);
        assert.deepStrictEqual([noConfigStateReads, javaStateReads], readsBefore);
    });

    for (const phase of ["activation", "serverReady"]) {
        for (const outcome of ["success", "rejection"]) {
            test(`registration owns its observer and ignores late ${phase} ${outcome} after disposal`, async () => {
                const { tool, disposable } = registerReadiness({ status: "ready" });
                if (phase === "serverReady") {
                    activation.resolve(javaApi);
                    await nextTurn();
                    assert.strictEqual(serverReadyCalls, 1);
                }
                disposable.dispose();
                disposable.dispose();
                assert.strictEqual(observerDisposals, 1);
                assert.strictEqual(lmDisposals, 1);
                const readsBefore = [noConfigStateReads, javaStateReads];

                if (outcome === "rejection") {
                    const pending = phase === "activation" ? activation : serverReady;
                    pending.reject(new Error("Late failure at C:\\private\\workspace"));
                } else if (phase === "activation") {
                    activation.resolve(javaApi);
                } else {
                    serverReady.resolve(true);
                }
                await nextTurn();

                assert.strictEqual(await invokeBlockedTool(tool), toolDisposed + noChanges);
                assert.deepStrictEqual([noConfigStateReads, javaStateReads], readsBefore);
                assert.strictEqual(apiCalls, 1);
                assert.strictEqual(serverReadyCalls, phase === "activation" ? 0 : 1);
                assert.strictEqual(errorTelemetry.length, 0);
            });
        }
    }

    test("does not auto-launch a refused invocation when Java becomes ready, but permits a new invocation", async () => {
        const { tool } = registerReadiness({ status: "ready" });
        assert.strictEqual(await invokeBlockedTool(tool), javaNotReady + noChanges);

        activation.resolve(javaApi);
        await nextTurn();
        assertNoLaunchWork();
        serverReady.resolve(true);
        await nextTurn();
        assertNoLaunchWork();

        await invokeAndCancelAfterReadiness(tool);
        assert.strictEqual(apiCalls, 1);
        assert.strictEqual(serverReadyCalls, 1);
    });

    test("refuses unfinished No-Config preparation promptly and requires a new invocation after it finishes", async () => {
        const { tool } = registerReadiness({ status: "initializing" });
        activation.resolve(javaApi);
        serverReady.resolve(true);
        await nextTurn();

        assert.strictEqual(await invokeBlockedTool(tool),
            "NO_CONFIG_NOT_READY: Java No-Config Debug is still preparing its terminal environment. "
            + "Retry after preparation completes; do not retry in a loop or change project code to resolve this readiness condition." + noChanges);

        noConfigState = { status: "ready" };
        await nextTurn();
        assertNoLaunchWork();
        await invokeAndCancelAfterReadiness(tool);
    });
});
