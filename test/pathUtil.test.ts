// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";

import { buildNoConfigPathAppendValue } from "../src/pathUtil";

// Regression tests for issue #1637.
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
        assert.ok(result.startsWith(";"));
    });

    test("always starts with a path separator (POSIX)", () => {
        const result = buildNoConfigPathAppendValue(posixDir, "linux");
        assert.ok(result.startsWith(":"));
    });

    test("never collapses scriptsDir into the previous PATH entry on Windows", () => {
        // #1637 scenario: last user PATH entry has no trailing separator.
        const userPath = "C:\\foo;C:\\Program Files\\jreleaser\\";
        const entries = (userPath + buildNoConfigPathAppendValue(winDir, "win32")).split(";");
        assert.ok(entries.includes("C:\\Program Files\\jreleaser\\"));
        assert.ok(entries.includes(winDir));
    });

    test("never collapses scriptsDir into the previous PATH entry on POSIX", () => {
        const userPath = "/usr/bin:/opt/jreleaser/bin";
        const entries = (userPath + buildNoConfigPathAppendValue(posixDir, "linux")).split(":");
        assert.ok(entries.includes("/opt/jreleaser/bin"));
        assert.ok(entries.includes(posixDir));
    });

    test("yields only an empty (harmless) entry when the user's PATH already ends with a separator", () => {
        const userPath = "C:\\foo;C:\\bar;";
        const entries = (userPath + buildNoConfigPathAppendValue(winDir, "win32")).split(";");
        assert.ok(entries.includes(winDir));
        assert.ok(!entries.some((e) => e !== winDir && e.endsWith(winDir)));
    });

    test("scriptsDir appears unchanged at the end of the appended value", () => {
        const result = buildNoConfigPathAppendValue(winDir, "win32");
        assert.ok(result.endsWith(winDir));
    });
});
