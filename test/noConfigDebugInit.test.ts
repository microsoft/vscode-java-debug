// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { ensureDebugJavaScriptExecutable } from "../src/noConfigDebugInit";

suite("No-Config Debug scripts", () => {
    test("the bundled POSIX wrapper uses LF and is executable", async () => {
        const scriptPath = path.resolve(
            __dirname,
            "../../bundled/scripts/noConfigScripts/debugjava",
        );
        const contents = await fs.promises.readFile(scriptPath, "utf8");

        assert.ok(contents.startsWith("#!/bin/bash\n"));
        assert.strictEqual(contents.includes("\r"), false);

        if (process.platform !== "win32") {
            const mode = (await fs.promises.stat(scriptPath)).mode % 0o1000;
            assert.strictEqual(mode, 0o755);
        }
    });

    test("adds owner execute permission without changing other permissions", async () => {
        if (process.platform === "win32") {
            return;
        }

        const tempDir = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), "vscode-java-debug-"),
        );
        const scriptPath = path.join(tempDir, "debugjava");

        try {
            await fs.promises.writeFile(scriptPath, "#!/usr/bin/env bash\n");

            const cases = [
                { initial: 0o444, expected: 0o544 },
                { initial: 0o600, expected: 0o700 },
                { initial: 0o644, expected: 0o744 },
                { initial: 0o6444, expected: 0o6544 },
            ];
            for (const testCase of cases) {
                await fs.promises.chmod(scriptPath, testCase.initial);
                await ensureDebugJavaScriptExecutable(scriptPath, "linux");

                const mode = (await fs.promises.stat(scriptPath)).mode % 0o10000;
                assert.strictEqual(mode, testCase.expected);
            }
        } finally {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    });

    test("does not chmod an already owner-executable POSIX wrapper", async () => {
        if (process.platform === "win32") {
            return;
        }

        const tempDir = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), "vscode-java-debug-"),
        );
        const scriptPath = path.join(tempDir, "debugjava");

        try {
            await fs.promises.writeFile(scriptPath, "#!/usr/bin/env bash\n");

            const originalChmod = fs.promises.chmod;
            let chmodCalls = 0;
            fs.promises.chmod = async (...args): Promise<void> => {
                chmodCalls += 1;
                return originalChmod(...args);
            };
            try {
                const executableModes = [0o700, 0o750, 0o775];
                for (const mode of executableModes) {
                    await originalChmod(scriptPath, mode);
                    await ensureDebugJavaScriptExecutable(scriptPath, "darwin");
                    const actualMode =
                        (await fs.promises.stat(scriptPath)).mode % 0o1000;
                    assert.strictEqual(actualMode, mode);
                }
            } finally {
                fs.promises.chmod = originalChmod;
            }

            assert.strictEqual(chmodCalls, 0);
        } finally {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    });

    test("does not change wrapper permissions on Windows", async () => {
        const missingScriptPath = path.join(
            os.tmpdir(),
            "vscode-java-debug-missing",
            "debugjava",
        );

        await ensureDebugJavaScriptExecutable(missingScriptPath, "win32");
    });
});
