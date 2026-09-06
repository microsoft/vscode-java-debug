// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as Mocha from "mocha";

import { run } from "./suite";

suite("test runner", () => {
    test("rejects when Mocha throws synchronously", async () => {
        const expectedError = new Error("Mocha failed to start");
        const originalRun = Mocha.prototype.run;
        Mocha.prototype.run = () => {
            throw expectedError;
        };

        try {
            await assert.rejects(run(), (error) => error === expectedError);
        } finally {
            Mocha.prototype.run = originalRun;
        }
    });
});
