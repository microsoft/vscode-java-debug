// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { before } from "mocha";
import * as vscode from "vscode";

suite("Extension Tests", () => {

    test("Extension should be present", () => {
        assert.ok(vscode.extensions.getExtension("vscjava.vscode-java-debug"));
    });

    test("should activate", function() {
        this.timeout(1 * 60 * 1000);
        return vscode.extensions.getExtension("vscjava.vscode-java-debug").activate().then((api) => {
            assert.ok(true);
        });
    });
});
