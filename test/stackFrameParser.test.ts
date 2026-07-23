// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";

import { parseJavaStackFrame } from "../src/stackFrameParser";

suite("parseJavaStackFrame", () => {
    test("parses a tab-indented stack frame", () => {
        const stackTrace = "com.example.App.main(App.java:42)";

        assert.deepStrictEqual(parseJavaStackFrame(`\tat ${stackTrace}`), {
            stackTrace,
            methodName: "com.example.App.main",
            lineNumber: 42,
            startIndex: 4,
            length: stackTrace.length,
        });
    });

    test("preserves a module prefix", () => {
        const stackTrace = "java.base/java.util.ArrayList.forEach(ArrayList.java:1511)";

        assert.deepStrictEqual(parseJavaStackFrame(`\tat ${stackTrace}`), {
            stackTrace,
            methodName: "java.util.ArrayList.forEach",
            lineNumber: 1511,
            startIndex: 4,
            length: stackTrace.length,
        });
    });

    test("calculates the link range within prefixed output", () => {
        const stackTrace = "com.example.Worker.run(Worker.java:7)";
        const line = `[stderr] \tat ${stackTrace} ~[app.jar:1.0]`;
        const frame = parseJavaStackFrame(line);

        assert.ok(frame);
        assert.strictEqual(frame.startIndex, line.indexOf(stackTrace));
        assert.strictEqual(frame.length, stackTrace.length);
        assert.strictEqual(line.substring(frame.startIndex, frame.startIndex + frame.length), stackTrace);
    });
});
