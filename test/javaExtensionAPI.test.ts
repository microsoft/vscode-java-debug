// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { IProgressReporter } from "../src/progressAPI";
import { getJavaExtensionAPI, getJavaHome } from "../src/utility";

suite("Java extension API activation", () => {
    const api = { javaRequirement: { java_home: path.join("test-jdk") } };
    let activation: Promise<typeof api>;
    let resolveActivation: (value: typeof api) => void;
    let rejectActivation: (error: Error) => void;
    let activateCalls: number;
    let source: vscode.CancellationTokenSource;
    let listenerCount: number;
    let progress: IProgressReporter;
    let restoreExtension: () => void;

    setup(() => {
        activation = new Promise((resolve, reject) => {
            resolveActivation = resolve;
            rejectActivation = reject;
        });
        activateCalls = 0;
        source = new vscode.CancellationTokenSource();
        listenerCount = 0;
        const token: vscode.CancellationToken = {
            get isCancellationRequested() { return source.token.isCancellationRequested; },
            onCancellationRequested: (listener) => {
                listenerCount += 1;
                const registration = source.token.onCancellationRequested(listener);
                return new vscode.Disposable(() => {
                    listenerCount -= 1;
                    registration.dispose();
                });
            },
        };
        progress = {
            setJobName: () => { },
            getId: () => "test",
            getProgressLocation: () => vscode.ProgressLocation.Notification,
            report: () => { },
            show: () => { },
            hide: () => { },
            isCancelled: () => token.isCancellationRequested,
            done: () => source.cancel(),
            getCancellationToken: () => token,
            observe: () => { },
        };
        const extensionPath = path.resolve(__dirname, "../..");
        const extension: vscode.Extension<typeof api> = {
            id: "redhat.java",
            extensionPath,
            extensionUri: vscode.Uri.file(extensionPath),
            isActive: false,
            packageJSON: {},
            extensionKind: vscode.ExtensionKind.Workspace,
            exports: api,
            activate() {
                activateCalls += 1;
                return activation;
            },
        };
        const descriptor = Object.getOwnPropertyDescriptor(vscode.extensions, "getExtension");
        assert.ok(descriptor);
        Object.defineProperty(vscode.extensions, "getExtension", {
            ...descriptor,
            value: (id: string) => {
                assert.strictEqual(id, "redhat.java");
                return extension;
            },
        });
        restoreExtension = () => Object.defineProperty(vscode.extensions, "getExtension", descriptor);
    });

    teardown(async () => {
        resolveActivation(api);
        await new Promise((resolve) => setImmediate(resolve));
        restoreExtension();
        source.dispose();
    });

    test("propagates activation rejection instead of leaving getJavaHome pending", async () => {
        const error = new Error("Java activation failed");
        const rejected = assert.rejects(getJavaHome(), (actual: unknown) => actual === error);
        rejectActivation(error);
        await rejected;
        assert.strictEqual(activateCalls, 1);
    });

    test("reads the Java tooling home from the activated API", async () => {
        const home = getJavaHome();
        resolveActivation(api);
        assert.strictEqual(await home, api.javaRequirement.java_home);
    });

    test("removes the cancellation listener after successful activation", async () => {
        const result = Promise.resolve(getJavaExtensionAPI(progress));
        assert.strictEqual(listenerCount, 1);
        resolveActivation(api);
        assert.strictEqual(await result, api);
        assert.strictEqual(listenerCount, 0);
    });

    test("propagates activation failure with progress and removes its listener", async () => {
        const error = new Error("Java activation failed with progress");
        const rejected = assert.rejects(Promise.resolve(getJavaExtensionAPI(progress)), (actual: unknown) => actual === error);
        rejectActivation(error);
        await rejected;
        assert.strictEqual(listenerCount, 0);
    });

    test("does not activate Java for an already cancelled caller", async () => {
        source.cancel();
        assert.strictEqual(await getJavaExtensionAPI(progress), undefined);
        assert.strictEqual(activateCalls, 0);
        assert.strictEqual(listenerCount, 0);
    });

    test("cancels one caller without cancelling another caller's activation", async () => {
        const cancelled = Promise.resolve(getJavaExtensionAPI(progress));
        const other = Promise.resolve(getJavaExtensionAPI());
        let otherSettled = false;
        void other.then(() => { otherSettled = true; });
        source.cancel();
        assert.strictEqual(await cancelled, undefined);
        assert.strictEqual(otherSettled, false);
        assert.strictEqual(listenerCount, 0);

        resolveActivation(api);
        assert.strictEqual(await other, api);
    });

    test("handles a late activation rejection after caller cancellation", async () => {
        const cancelled = Promise.resolve(getJavaExtensionAPI(progress));
        source.cancel();
        assert.strictEqual(await cancelled, undefined);
        rejectActivation(new Error("Late activation failure"));
        await new Promise((resolve) => setImmediate(resolve));
        assert.strictEqual(listenerCount, 0);
    });
});
