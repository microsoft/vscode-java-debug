// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as cp from "child_process";
import * as path from "path";
import { downloadAndUnzipVSCode, runTests } from "vscode-test";

async function main(): Promise<void> {
    try {
        const vscodeExecutablePath = await downloadAndUnzipVSCode();
        console.log(vscodeExecutablePath);
        cp.spawnSync(vscodeExecutablePath, ["--install-extension", "redhat.java"], {
            encoding: "utf-8",
            stdio: "inherit",
        });
        console.log("redhat.java installed");

        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath: string = path.resolve(__dirname, "../../");

        // The path to the extension test script
        // Passed to --extensionTestsPath
        const extensionTestsPath: string = path.resolve(__dirname, "./suite/index");

        // Download VS Code, unzip it and run the integration test
        await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error("Failed to run tests");
        process.exit(1);
    }
}

main();
