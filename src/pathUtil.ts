// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Builds the value to append to PATH for the noConfigScripts directory.
 *
 * `vscode.EnvironmentVariableCollection.append()` performs literal string
 * concatenation and does NOT insert a path separator. We always prepend one so
 * we never glue our directory onto the last entry of the user's PATH (e.g.
 * `...;C:\Program Files\jreleaser\c:\Users\...\noConfigScripts`).
 *
 * We cannot rely on `process.env.PATH` ending with a separator: the integrated
 * terminal's PATH may differ from the extension host's PATH (it can be modified
 * by `terminal.integrated.env.*` or by other extensions' env-var collections).
 *
 * A leading separator is always safe: if the resolved PATH already ends with
 * one, the resulting empty PATH entry is harmless on both Windows and POSIX
 * shells.
 *
 * This module has no `vscode` import so it can be unit-tested in plain Node.
 *
 * @param scriptsDir absolute path to the noConfigScripts directory
 * @param platform   the target platform; defaults to `process.platform`. Made
 *                   injectable so unit tests can exercise both Windows and
 *                   POSIX behavior on a single host.
 */
export function buildNoConfigPathAppendValue(
    scriptsDir: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const pathSeparator = platform === 'win32' ? ';' : ':';
    return `${pathSeparator}${scriptsDir}`;
}
