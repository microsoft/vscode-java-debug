// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";

import { buildNoConfigPathAppendValue } from "../src/pathUtil";

// Regression tests for issue #1637: the extension was appending its
// noConfigScripts directory to PATH without a separator on some terminal
// PATH configurations, gluing it onto the last entry of the user's PATH.
suite("buildNoConfigPathAppendValue", () => {

    const winDir = "C:\\Users\\me\\.vscode\\extensions\\vscjava.vscode-java-debug-0.59.0\\bundled\\scripts\\noConfigScripts";
    const posixDir = "/home/me/.vscode/extensions/vscjava.vscode-java-debug-0.59.0/bundled/scripts/noConfigScripts";

    test("uses ';' as separator on Windows", () => {
        const result = buildNoConfigPathAppendValue(winDir, "win32");
        assert.strictEqual(result, `;${winDir}`);
    });

    test("uses ':' as separator on Linux", () => {
        const result = buildNoConfigPathAppendValue(posixDir, "linux");
        assert.strictEqual(result, `:${posixDir}`);
    });

    test("uses ':' as separator on macOS", () => {
        const result = buildNoConfigPathAppendValue(posixDir, "darwin");
        assert.strictEqual(result, `:${posixDir}`);
    });

    test("always starts with a path separator (Windows)", () => {
        const result = buildNoConfigPathAppendValue(winDir, "win32");
        assert.ok(result.startsWith(";"), `expected leading ';', got: ${result}`);
    });

    test("always starts with a path separator (POSIX)", () => {
        const result = buildNoConfigPathAppendValue(posixDir, "linux");
        assert.ok(result.startsWith(":"), `expected leading ':', got: ${result}`);
    });

    test("never collapses scriptsDir into the previous PATH entry on Windows", () => {
        // Simulates the exact scenario from issue #1637: a user PATH whose
        // last entry has no trailing separator. After append, the script dir
        // must not be glued onto 'jreleaser\'.
        const userPath = "C:\\foo;C:\\Program Files\\jreleaser\\";
        const finalPath = userPath + buildNoConfigPathAppendValue(winDir, "win32");

        const entries = finalPath.split(";");
        assert.ok(
            entries.includes("C:\\Program Files\\jreleaser\\"),
            `expected 'jreleaser\\' to remain a standalone PATH entry, got entries: ${JSON.stringify(entries)}`,
        );
        assert.ok(
            entries.includes(winDir),
            `expected scripts dir to be a standalone PATH entry, got entries: ${JSON.stringify(entries)}`,
        );
    });

    test("never collapses scriptsDir into the previous PATH entry on POSIX", () => {
        const userPath = "/usr/bin:/opt/jreleaser/bin";
        const finalPath = userPath + buildNoConfigPathAppendValue(posixDir, "linux");

        const entries = finalPath.split(":");
        assert.ok(
            entries.includes("/opt/jreleaser/bin"),
            `expected '/opt/jreleaser/bin' to remain a standalone PATH entry, got entries: ${JSON.stringify(entries)}`,
        );
        assert.ok(
            entries.includes(posixDir),
            `expected scripts dir to be a standalone PATH entry, got entries: ${JSON.stringify(entries)}`,
        );
    });

    test("yields only an empty (harmless) entry when the user's PATH already ends with a separator", () => {
        // If the resolved terminal PATH already ends with ';', append produces
        // ';;'. The empty middle entry is ignored by Windows and (in this
        // position) effectively a no-op on POSIX shells.
        const userPath = "C:\\foo;C:\\bar;";
        const finalPath = userPath + buildNoConfigPathAppendValue(winDir, "win32");

        const entries = finalPath.split(";");
        // The scripts dir must still be a standalone, valid entry.
        assert.ok(
            entries.includes(winDir),
            `expected scripts dir to remain standalone, got entries: ${JSON.stringify(entries)}`,
        );
        // No real entry should be merged with our scripts dir.
        assert.ok(
            !entries.some((e) => e !== winDir && e.endsWith(winDir)),
            `no entry should be glued to scripts dir, got entries: ${JSON.stringify(entries)}`,
        );
    });

    test("scriptsDir appears unchanged at the end of the appended value", () => {
        const result = buildNoConfigPathAppendValue(winDir, "win32");
        assert.ok(result.endsWith(winDir), `expected value to end with scriptsDir, got: ${result}`);
    });
});
