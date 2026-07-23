// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

// The single source of truth for parsing a Java stack frame, shared by the terminal link provider
// and the document (stack-trace) link provider so the matching stays identical across surfaces.

export interface IParsedStackFrame {
    // The `com.foo.Bar.baz(Bar.java:42)` text handed to `resolveSourceUri` for source resolution.
    stackTrace: string;
    // The fully-qualified method (`com.foo.Bar.baz`), used for the class-name quick-pick fallback.
    methodName: string;
    // The positive, safe 1-based source line number parsed from the frame.
    lineNumber: number;
    // Offset of the frame within the input line (points at the class name, past the leading `at `).
    startIndex: number;
    // Length of the linkifiable frame text (equals `stackTrace.length`).
    length: number;
}

/**
 * Parses the first Java stack frame (e.g. `\tat module/com.foo.Bar.baz(Bar.java:42)`) out of a line,
 * or returns undefined when none is present.
 *
 * A fresh `RegExp` is created per call on purpose: provider callbacks can overlap asynchronously,
 * so a shared stateful `RegExp` (were a `g`/`y` flag ever added) could corrupt `lastIndex`.
 */
export function parseJavaStackFrame(line: string): IParsedStackFrame | undefined {
    // Group 2: optional module prefix, group 3: fully-qualified method, group 5: `File.java:line`.
    const regex = /(\sat\s+)([\w$.]+\/)?(([\w$]+\.)+[<\w$>]+)\(([\w-$]+\.java:\d+)\)/;
    const result = regex.exec(line);
    if (!result || !result.length) {
        return undefined;
    }

    const stackTrace = `${result[2] || ""}${result[3]}(${result[5]})`;
    const lineNumber = Number(result[5].split(":")[1]);
    if (!Number.isSafeInteger(lineNumber) || lineNumber <= 0) {
        return undefined;
    }

    return {
        stackTrace,
        methodName: result[3],
        lineNumber,
        startIndex: result.index + result[1].length,
        length: stackTrace.length,
    };
}
