// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as telemetry from "vscode-extension-telemetry-wrapper";

import { JavaServerReadiness, observeJavaServerReadiness } from "../src/javaServerReadiness";
import * as utility from "../src/utility";
import { deferred } from "./helpers/deferred";

suite("Java language server readiness observer", () => {
    const initializationFailed = "Java language server initialization failed. "
        + "Check the Java language server logs, resolve the startup problem, and reload VS Code before retrying.";
    const apiUnavailable = "Java language server readiness API is unavailable. "
        + "Update Language Support for Java by Red Hat and reload VS Code before retrying.";
    const privateFailure = "Private Java startup details at C:\\private\\workspace\\Main.java";

    interface TestJavaAPI {
        serverMode: utility.ServerMode;
        status: string;
        serverReady?: () => Thenable<boolean>;
    }

    let cleanups: (() => void)[];
    let observers: JavaServerReadiness[];
    let activation: ReturnType<typeof deferred<TestJavaAPI | undefined>>;
    let serverReady: ReturnType<typeof deferred<boolean>>;
    let javaApi: TestJavaAPI;
    let apiCalls: number;
    let serverReadyCalls: number;
    let errorTelemetry: Parameters<typeof telemetry.sendError>[];

    function overrideProperty(target: object, key: string, descriptor: PropertyDescriptor): void {
        const original = Object.getOwnPropertyDescriptor(target, key);
        assert.ok(original);
        Object.defineProperty(target, key, { configurable: true, ...descriptor });
        cleanups.push(() => Object.defineProperty(target, key, original));
    }

    function nextTurn(): Promise<void> {
        return new Promise((resolve) => setImmediate(resolve));
    }

    function observe(): JavaServerReadiness {
        const observer = observeJavaServerReadiness();
        observers.push(observer);
        assert.deepStrictEqual(observer.getState(), { status: "initializing" });
        return observer;
    }

    function assertReportedFailure(observer: JavaServerReadiness, message: string = initializationFailed): void {
        assert.deepStrictEqual(observer.getState(), { status: "failed", message });
        assert.deepStrictEqual(observer.getState(), { status: "failed", message });
        assert.deepStrictEqual(errorTelemetry, [[{ name: "JavaServerReadinessError", message }]]);
    }

    setup(() => {
        cleanups = [];
        observers = [];
        activation = deferred<TestJavaAPI | undefined>();
        serverReady = deferred<boolean>();
        apiCalls = 0;
        serverReadyCalls = 0;
        errorTelemetry = [];
        javaApi = {
            serverMode: utility.ServerMode.STANDARD,
            status: "Started",
            serverReady() {
                serverReadyCalls += 1;
                return serverReady.promise;
            },
        };
        overrideProperty(utility, "getJavaExtensionAPI", {
            value: () => {
                apiCalls += 1;
                return activation.promise;
            },
        });
        overrideProperty(telemetry, "sendError", {
            value: (...args: Parameters<typeof telemetry.sendError>) => { errorTelemetry.push(args); },
        });
    });

    teardown(async () => {
        for (const observer of observers.reverse()) {
            observer.dispose();
        }
        activation.resolve(undefined);
        serverReady.resolve(true);
        await nextTurn();
        for (const cleanup of cleanups.reverse()) {
            cleanup();
        }
    });

    test("starts activation once and stays initializing while the Java API is pending", async () => {
        const observer = observe();
        assert.deepStrictEqual(observer.getState(), { status: "initializing" });
        await nextTurn();

        assert.deepStrictEqual(observer.getState(), { status: "initializing" });
        assert.strictEqual(apiCalls, 1);
        assert.strictEqual(serverReadyCalls, 0);
        assert.strictEqual(errorTelemetry.length, 0);
    });

    test("waits for serverReady even when the API reports Standard mode and Started status", async () => {
        const observer = observe();
        activation.resolve(javaApi);
        await nextTurn();

        assert.deepStrictEqual(observer.getState(), { status: "initializing" });
        assert.deepStrictEqual(observer.getState(), { status: "initializing" });
        assert.strictEqual(apiCalls, 1);
        assert.strictEqual(serverReadyCalls, 1);
        assert.strictEqual(errorTelemetry.length, 0);
    });

    test("becomes ready after serverReady resolves true without restarting observation on state reads", async () => {
        const observer = observe();
        activation.resolve(javaApi);
        await nextTurn();
        serverReady.resolve(true);
        await nextTurn();

        assert.deepStrictEqual(observer.getState(), { status: "ready" });
        assert.deepStrictEqual(observer.getState(), { status: "ready" });
        assert.strictEqual(apiCalls, 1);
        assert.strictEqual(serverReadyCalls, 1);
        assert.strictEqual(errorTelemetry.length, 0);
    });

    test("handles activation rejection with controlled state and error telemetry, not raw error details", async () => {
        const observer = observe();
        activation.reject(new Error(privateFailure));
        await nextTurn();

        assertReportedFailure(observer);
        assert.strictEqual(apiCalls, 1);
        assert.strictEqual(serverReadyCalls, 0);
    });

    test("handles a synchronous Java API lookup error as an initialization failure", async () => {
        overrideProperty(utility, "getJavaExtensionAPI", {
            value: () => {
                apiCalls += 1;
                throw new Error(privateFailure);
            },
        });
        const observer = observe();
        await nextTurn();

        assertReportedFailure(observer);
        assert.strictEqual(apiCalls, 1);
        assert.strictEqual(serverReadyCalls, 0);
    });

    for (const outcome of ["rejection", "false"]) {
        test(`reports controlled initialization failure when serverReady returns ${outcome}`, async () => {
            const observer = observe();
            activation.resolve(javaApi);
            await nextTurn();
            if (outcome === "rejection") {
                serverReady.reject(new Error(privateFailure));
            } else {
                serverReady.resolve(false);
            }
            await nextTurn();

            assertReportedFailure(observer);
            assert.strictEqual(apiCalls, 1);
            assert.strictEqual(serverReadyCalls, 1);
        });
    }

    for (const missing of ["API", "serverReady"]) {
        test(`reports update guidance when the Java ${missing} is missing`, async () => {
            const observer = observe();
            activation.resolve(missing === "API" ? undefined : {
                serverMode: utility.ServerMode.STANDARD,
                status: "Started",
            });
            await nextTurn();

            assertReportedFailure(observer, apiUnavailable);
            assert.strictEqual(serverReadyCalls, 0);
        });
    }

    for (const ready of [false, true]) {
        test(`reports Error status even when serverReady is ${ready ? "resolved" : "pending"}`, async () => {
            const observer = observe();
            activation.resolve(javaApi);
            if (ready) {
                serverReady.resolve(true);
            }
            await nextTurn();
            assert.deepStrictEqual(observer.getState(), { status: ready ? "ready" : "initializing" });
            javaApi.status = "Error";

            assert.deepStrictEqual(observer.getState(), { status: "failed", message: initializationFailed });
            assert.deepStrictEqual(observer.getState(), { status: "failed", message: initializationFailed });
            assert.strictEqual(apiCalls, 1);
            assert.strictEqual(serverReadyCalls, 1);
            assert.strictEqual(errorTelemetry.length, 0);
        });
    }

    test("reports initializing while the server is Stopping even after successful readiness", async () => {
        const observer = observe();
        activation.resolve(javaApi);
        serverReady.resolve(true);
        await nextTurn();
        assert.deepStrictEqual(observer.getState(), { status: "ready" });
        javaApi.status = "Stopping";

        assert.deepStrictEqual(observer.getState(), { status: "initializing" });
        assert.strictEqual(apiCalls, 1);
        assert.strictEqual(serverReadyCalls, 1);
        assert.strictEqual(errorTelemetry.length, 0);
    });

    for (const phase of ["activation", "serverReady"]) {
        for (const outcome of ["success", "rejection"]) {
            test(`preserves disposal on late ${phase} ${outcome} without further work or error telemetry`, async () => {
                const observer = observe();
                if (phase === "serverReady") {
                    activation.resolve(javaApi);
                    await nextTurn();
                    assert.strictEqual(serverReadyCalls, 1);
                }
                observer.dispose();
                observer.dispose();
                javaApi.status = "Error";
                assert.deepStrictEqual(observer.getState(), { status: "disposed" });

                if (outcome === "rejection") {
                    const pending = phase === "activation" ? activation : serverReady;
                    pending.reject(new Error(privateFailure));
                } else if (phase === "activation") {
                    activation.resolve(javaApi);
                } else {
                    serverReady.resolve(true);
                }
                await nextTurn();

                assert.deepStrictEqual(observer.getState(), { status: "disposed" });
                assert.strictEqual(apiCalls, 1);
                assert.strictEqual(serverReadyCalls, phase === "activation" ? 0 : 1);
                assert.strictEqual(errorTelemetry.length, 0);
            });
        }
    }
});
