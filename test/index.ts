// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { runTests } from "vscode-test";

async function main(): Promise<void> {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath: string = path.resolve(__dirname, "../../");

        // The path to the extension test script
        // Passed to --extensionTestsPath
        const extensionTestsPath: string = path.resolve(__dirname, "./suite/index");

        // Download VS Code, unzip it and run the integration test
        await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        process.exit(1);
    }
}

main();
