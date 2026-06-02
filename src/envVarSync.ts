// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

/**
 * Helpers that update a {@link vscode.EnvironmentVariableCollection} only when
 * the resulting mutation would actually change the collection.
 *
 * Background: VS Code shows a "Restart terminal to apply environment variable
 * changes" prompt whenever an extension's collection differs from what has
 * already been applied to running terminals. Calling `replace()` / `append()`
 * with the same value, or calling `clear()` followed by re-adding identical
 * entries, still counts as a change and re-triggers the prompt on every
 * window reload. See issue #1647.
 *
 * These helpers compare the existing mutator (type + value + options) against
 * the desired one and skip the write entirely when they match.
 */

const DEFAULT_OPTIONS: Required<vscode.EnvironmentVariableMutatorOptions> = {
    applyAtProcessCreation: true,
    applyAtShellIntegration: false,
};

function normalizeOptions(
    options?: vscode.EnvironmentVariableMutatorOptions,
): Required<vscode.EnvironmentVariableMutatorOptions> {
    return { ...DEFAULT_OPTIONS, ...options };
}

function sameOptions(
    existing: vscode.EnvironmentVariableMutator,
    desired?: vscode.EnvironmentVariableMutatorOptions,
): boolean {
    const e = normalizeOptions(existing.options);
    const d = normalizeOptions(desired);
    return e.applyAtProcessCreation === d.applyAtProcessCreation
        && e.applyAtShellIntegration === d.applyAtShellIntegration;
}

/**
 * Calls `collection.replace(variable, value, options)` only when the existing
 * mutator (if any) does not already match.
 *
 * @returns `true` if the collection was actually written to.
 */
export function applyReplaceIfChanged(
    collection: vscode.EnvironmentVariableCollection,
    variable: string,
    value: string,
    options?: vscode.EnvironmentVariableMutatorOptions,
): boolean {
    const existing = collection.get(variable);
    if (existing
        && existing.type === vscode.EnvironmentVariableMutatorType.Replace
        && existing.value === value
        && sameOptions(existing, options)) {
        return false;
    }
    if (options) {
        collection.replace(variable, value, options);
    } else {
        collection.replace(variable, value);
    }
    return true;
}

/**
 * Calls `collection.append(variable, value, options)` only when the existing
 * mutator (if any) does not already match.
 *
 * @returns `true` if the collection was actually written to.
 */
export function applyAppendIfChanged(
    collection: vscode.EnvironmentVariableCollection,
    variable: string,
    value: string,
    options?: vscode.EnvironmentVariableMutatorOptions,
): boolean {
    const existing = collection.get(variable);
    if (existing
        && existing.type === vscode.EnvironmentVariableMutatorType.Append
        && existing.value === value
        && sameOptions(existing, options)) {
        return false;
    }
    if (options) {
        collection.append(variable, value, options);
    } else {
        collection.append(variable, value);
    }
    return true;
}

/**
 * Deletes the mutator for `variable` only when one is currently present.
 *
 * @returns `true` if a mutator was deleted.
 */
export function deleteIfPresent(
    collection: vscode.EnvironmentVariableCollection,
    variable: string,
): boolean {
    if (collection.get(variable)) {
        collection.delete(variable);
        return true;
    }
    return false;
}
