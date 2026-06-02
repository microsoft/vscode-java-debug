// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as vscode from "vscode";

import {
    applyAppendIfChanged,
    applyReplaceIfChanged,
} from "../src/envVarSync";

interface FakeMutator {
    type: vscode.EnvironmentVariableMutatorType;
    value: string;
    options: vscode.EnvironmentVariableMutatorOptions;
}

interface FakeCollection extends vscode.EnvironmentVariableCollection {
    __calls: { replace: number; append: number; delete: number };
}

function createFakeCollection(): FakeCollection {
    const store = new Map<string, FakeMutator>();
    const calls = { replace: 0, append: 0, delete: 0 };

    const collection = {
        persistent: true,
        description: undefined as string | vscode.MarkdownString | undefined,
        get(name: string): FakeMutator | undefined {
            return store.get(name);
        },
        replace(name: string, value: string, options?: vscode.EnvironmentVariableMutatorOptions): void {
            calls.replace += 1;
            store.set(name, {
                type: vscode.EnvironmentVariableMutatorType.Replace,
                value,
                options: { applyAtProcessCreation: true, applyAtShellIntegration: false, ...options },
            });
        },
        append(name: string, value: string, options?: vscode.EnvironmentVariableMutatorOptions): void {
            calls.append += 1;
            store.set(name, {
                type: vscode.EnvironmentVariableMutatorType.Append,
                value,
                options: { applyAtProcessCreation: true, applyAtShellIntegration: false, ...options },
            });
        },
        prepend(name: string, value: string, options?: vscode.EnvironmentVariableMutatorOptions): void {
            store.set(name, {
                type: vscode.EnvironmentVariableMutatorType.Prepend,
                value,
                options: { applyAtProcessCreation: true, applyAtShellIntegration: false, ...options },
            });
        },
        delete(name: string): void {
            calls.delete += 1;
            store.delete(name);
        },
        clear(): void {
            store.clear();
        },
        forEach(callback: (variable: string, mutator: FakeMutator, collection: any) => void): void {
            store.forEach((mutator, variable) => callback(variable, mutator, collection));
        },
        getScoped(): vscode.EnvironmentVariableCollection {
            return collection as unknown as vscode.EnvironmentVariableCollection;
        },
        *[Symbol.iterator](): IterableIterator<[string, FakeMutator]> {
            yield* store.entries();
        },
        __calls: calls,
    };

    return collection as unknown as FakeCollection;
}

suite("envVarSync", () => {
    suite("applyReplaceIfChanged", () => {
        test("writes when variable is missing", () => {
            const c = createFakeCollection();
            const changed = applyReplaceIfChanged(c, "FOO", "bar");
            assert.strictEqual(changed, true);
            assert.strictEqual(c.__calls.replace, 1);
            assert.strictEqual(c.get("FOO")!.value, "bar");
            assert.strictEqual(c.get("FOO")!.type, vscode.EnvironmentVariableMutatorType.Replace);
        });

        test("is a no-op when value and type already match (default options)", () => {
            const c = createFakeCollection();
            applyReplaceIfChanged(c, "FOO", "bar");
            c.__calls.replace = 0;

            const changed = applyReplaceIfChanged(c, "FOO", "bar");

            assert.strictEqual(changed, false);
            assert.strictEqual(c.__calls.replace, 0);
        });

        test("writes when value differs", () => {
            const c = createFakeCollection();
            applyReplaceIfChanged(c, "FOO", "bar");
            c.__calls.replace = 0;

            const changed = applyReplaceIfChanged(c, "FOO", "baz");

            assert.strictEqual(changed, true);
            assert.strictEqual(c.__calls.replace, 1);
            assert.strictEqual(c.get("FOO")!.value, "baz");
        });

        test("overrides an existing Append mutator", () => {
            const c = createFakeCollection();
            applyAppendIfChanged(c, "FOO", "bar");
            c.__calls.replace = 0;

            const changed = applyReplaceIfChanged(c, "FOO", "bar");

            assert.strictEqual(changed, true);
            assert.strictEqual(c.__calls.replace, 1);
            assert.strictEqual(c.get("FOO")!.type, vscode.EnvironmentVariableMutatorType.Replace);
        });

        test("writes when options differ from existing mutator", () => {
            const c = createFakeCollection();
            applyReplaceIfChanged(c, "FOO", "bar", { applyAtProcessCreation: true, applyAtShellIntegration: false });
            c.__calls.replace = 0;

            const changed = applyReplaceIfChanged(c, "FOO", "bar", { applyAtProcessCreation: false, applyAtShellIntegration: false });

            assert.strictEqual(changed, true);
            assert.strictEqual(c.__calls.replace, 1);
        });

        test("treats omitted options as the documented defaults", () => {
            const c = createFakeCollection();
            applyReplaceIfChanged(c, "FOO", "bar", { applyAtProcessCreation: true, applyAtShellIntegration: false });
            c.__calls.replace = 0;

            const changed = applyReplaceIfChanged(c, "FOO", "bar");

            assert.strictEqual(changed, false);
            assert.strictEqual(c.__calls.replace, 0);
        });
    });

    suite("applyAppendIfChanged", () => {
        test("writes when variable is missing", () => {
            const c = createFakeCollection();
            const changed = applyAppendIfChanged(c, "PATH", ";C:\\extra");
            assert.strictEqual(changed, true);
            assert.strictEqual(c.__calls.append, 1);
            assert.strictEqual(c.get("PATH")!.value, ";C:\\extra");
            assert.strictEqual(c.get("PATH")!.type, vscode.EnvironmentVariableMutatorType.Append);
        });

        test("is a no-op when value already matches", () => {
            const c = createFakeCollection();
            applyAppendIfChanged(c, "PATH", ";C:\\extra");
            c.__calls.append = 0;

            const changed = applyAppendIfChanged(c, "PATH", ";C:\\extra");

            assert.strictEqual(changed, false);
            assert.strictEqual(c.__calls.append, 0);
        });

        test("writes when value differs", () => {
            const c = createFakeCollection();
            applyAppendIfChanged(c, "PATH", ";C:\\extra");
            c.__calls.append = 0;

            const changed = applyAppendIfChanged(c, "PATH", ";C:\\other");

            assert.strictEqual(changed, true);
            assert.strictEqual(c.__calls.append, 1);
            assert.strictEqual(c.get("PATH")!.value, ";C:\\other");
        });

        test("overrides an existing Replace mutator on the same variable", () => {
            const c = createFakeCollection();
            applyReplaceIfChanged(c, "PATH", ";C:\\extra");
            c.__calls.append = 0;

            const changed = applyAppendIfChanged(c, "PATH", ";C:\\extra");

            assert.strictEqual(changed, true);
            assert.strictEqual(c.__calls.append, 1);
            assert.strictEqual(c.get("PATH")!.type, vscode.EnvironmentVariableMutatorType.Append);
        });
    });

    suite("regression: issue #1647 - repeated activations stay quiet", () => {
        test("re-applying the same set of variables does not touch the collection", () => {
            const c = createFakeCollection();

            // Simulate first activation.
            applyReplaceIfChanged(c, "VSCODE_JDWP_ADAPTER_ENDPOINTS", "/tmp/endpoint-abc.txt");
            applyReplaceIfChanged(c, "VSCODE_JAVA_EXEC", "/opt/jdk/bin/java");
            applyAppendIfChanged(c, "PATH", ":/ext/bundled/scripts/noConfigScripts");

            const callsAfterFirst = { ...c.__calls };
            assert.deepStrictEqual(callsAfterFirst, { replace: 2, append: 1, delete: 0 });

            // Simulate a window reload: same values, same order.
            applyReplaceIfChanged(c, "VSCODE_JDWP_ADAPTER_ENDPOINTS", "/tmp/endpoint-abc.txt");
            applyReplaceIfChanged(c, "VSCODE_JAVA_EXEC", "/opt/jdk/bin/java");
            applyAppendIfChanged(c, "PATH", ":/ext/bundled/scripts/noConfigScripts");

            // Nothing should have been written on the second pass.
            assert.deepStrictEqual(c.__calls, callsAfterFirst);
        });
    });
});
