// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { JavaDebugConfigurationProvider } from "../src/configurationProvider";

interface TestWorkspace {
    root: string;
    folder: vscode.WorkspaceFolder;
    libDir: string;
    jarPath: string;
}

type FilterExcluded = (
    folder: vscode.WorkspaceFolder | undefined,
    paths: string[],
) => Promise<string[]>;

function createTestWorkspace(): TestWorkspace {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "java-debug-cp-test-"));
    const libDir = path.join(root, "lib");
    fs.mkdirSync(libDir);
    const jarPath = path.join(libDir, "foo.jar");
    fs.writeFileSync(jarPath, "");
    return {
        root,
        folder: {
            uri: vscode.Uri.file(root),
            name: "test-workspace",
            index: 0,
        },
        libDir,
        jarPath,
    };
}

function getFilterExcluded(provider: JavaDebugConfigurationProvider): FilterExcluded {
    return (provider as unknown as { filterExcluded: FilterExcluded }).filterExcluded.bind(provider);
}

suite("JavaDebugConfigurationProvider", () => {
    const workspaces: TestWorkspace[] = [];

    suiteSetup(() => {
        // configurationProvider requires ../package.json relative to out/src/
        const outPackageJson = path.join(__dirname, "../package.json");
        if (!fs.existsSync(outPackageJson)) {
            fs.copyFileSync(path.join(__dirname, "../../package.json"), outPackageJson);
        }
    });

    teardown(() => {
        while (workspaces.length > 0) {
            const workspace = workspaces.pop()!;
            fs.rmSync(workspace.root, { recursive: true, force: true });
        }
    });

    suite("filterExcluded exact-match exclusions", () => {
        async function assertExactDirectoryExclusion(
            excludeSuffix: "\\" | "/",
            label: string,
            includeSuffix: "" | "\\" | "/" = "",
        ): Promise<void> {
            const workspace = createTestWorkspace();
            workspaces.push(workspace);

            const libDirFs = vscode.Uri.file(workspace.libDir).fsPath;
            const jarFs = vscode.Uri.file(workspace.jarPath).fsPath;
            const filterExcluded = getFilterExcluded(new JavaDebugConfigurationProvider());
            const result = await filterExcluded(workspace.folder, [
                `${libDirFs}${includeSuffix}`,
                jarFs,
                `!${workspace.libDir}${excludeSuffix}`,
            ]);

            assert.deepStrictEqual(
                result,
                [jarFs],
                `${label}: trailing slash should exact-exclude only the directory entry, not paths beneath it`,
            );
        }

        test("treats a trailing backslash as an exact match (Windows-style paths)", async () => {
            await assertExactDirectoryExclusion("\\", "Windows-style");
        });

        test("treats a trailing forward slash as an exact match (Linux-style paths)", async () => {
            await assertExactDirectoryExclusion("/", "Linux-style");
        });

        test("exact-matches when the included Windows-style path ends with a backslash", async () => {
            await assertExactDirectoryExclusion("\\", "Windows-style included trailing separator", "\\");
        });

        test("exact-matches when the included Linux-style path ends with a forward slash", async () => {
            await assertExactDirectoryExclusion("/", "Linux-style included trailing separator", "/");
        });
    });
});
