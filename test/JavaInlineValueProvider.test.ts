// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { Range } from "vscode";

import { toCodeRange, toProtocolRange } from "../src/JavaInlineValueProvider";

suite("JavaInlineValueProvider", () => {
    test("converts ranges without relying on language client internals", () => {
        const codeRange = new Range(1, 2, 3, 4);
        const protocolRange = toProtocolRange(codeRange);

        assert.deepStrictEqual(protocolRange, {
            start: { line: 1, character: 2 },
            end: { line: 3, character: 4 },
        });
        assert.ok(toCodeRange(protocolRange).isEqual(codeRange));
    });
});
