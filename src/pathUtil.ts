// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Builds the value to append to PATH for the noConfigScripts directory.
 *
 * `vscode.EnvironmentVariableCollection.append()` does literal string
 * concatenation, so we always prepend a separator to avoid gluing our
 * directory onto the last entry of the user's PATH (see issue #1637).
 *
 * @param platform defaults to `process.platform`; injectable for tests.
 */
export function buildNoConfigPathAppendValue(
    scriptsDir: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const pathSeparator = platform === 'win32' ? ';' : ':';
    return `${pathSeparator}${scriptsDir}`;
}
