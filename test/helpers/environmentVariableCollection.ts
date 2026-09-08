// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export interface FakeCollection extends vscode.EnvironmentVariableCollection {
    __calls: { replace: number; append: number; delete: number };
}

export function createFakeCollection(): FakeCollection {
    const store = new Map<string, vscode.EnvironmentVariableMutator>();
    const calls = { replace: 0, append: 0, delete: 0 };
    const collection: FakeCollection = {
        persistent: true,
        description: undefined,
        get(name) {
            return store.get(name);
        },
        replace(name, value, options): void {
            calls.replace += 1;
            store.set(name, {
                type: vscode.EnvironmentVariableMutatorType.Replace,
                value,
                options: { applyAtProcessCreation: true, applyAtShellIntegration: false, ...options },
            });
        },
        append(name, value, options): void {
            calls.append += 1;
            store.set(name, {
                type: vscode.EnvironmentVariableMutatorType.Append,
                value,
                options: { applyAtProcessCreation: true, applyAtShellIntegration: false, ...options },
            });
        },
        prepend(name, value, options): void {
            store.set(name, {
                type: vscode.EnvironmentVariableMutatorType.Prepend,
                value,
                options: { applyAtProcessCreation: true, applyAtShellIntegration: false, ...options },
            });
        },
        delete(name): void {
            calls.delete += 1;
            store.delete(name);
        },
        clear(): void {
            store.clear();
        },
        forEach(callback, thisArg): void {
            store.forEach((mutator, variable) => callback.call(thisArg, variable, mutator, collection));
        },
        *[Symbol.iterator](): IterableIterator<[string, vscode.EnvironmentVariableMutator]> {
            yield* store.entries();
        },
        __calls: calls,
    };
    return collection;
}
