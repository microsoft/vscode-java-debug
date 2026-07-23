// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { CancellationTokenSource, workspace } from "vscode";

import { JavaStackTraceLinkProvider } from "../src/stackTraceLinkProvider";

suite("JavaStackTraceLinkProvider", () => {
    async function provideLinks(content: string) {
        const document = await workspace.openTextDocument({ language: "log", content });
        const cancellation = new CancellationTokenSource();

        try {
            return await Promise.resolve(
                new JavaStackTraceLinkProvider().provideDocumentLinks(document, cancellation.token),
            );
        } finally {
            cancellation.dispose();
        }
    }

    test("encodes command URI arguments as an array", async () => {
        const stackTrace = "com.example.App.main(App.java:42)";
        const links = await provideLinks(`\tat ${stackTrace}`);

        assert.ok(links);
        assert.strictEqual(links.length, 1);

        const target = links[0].target;
        assert.ok(target);
        assert.deepStrictEqual(JSON.parse(decodeURIComponent(target.query)), [{
            stackTrace,
            methodName: "com.example.App.main",
            lineNumber: 42,
        }]);
    });

    test("stops scanning after the document character budget", async () => {
        const longPrefix = `${"x".repeat(1000)}\n`.repeat(1000);
        const links = await provideLinks(`${longPrefix}\tat com.example.App.main(App.java:42)`);

        assert.deepStrictEqual(links, []);
    });

    test("stops scanning after the document line budget", async () => {
        const links = await provideLinks(`${"\n".repeat(10000)}\tat com.example.App.main(App.java:42)`);

        assert.deepStrictEqual(links, []);
    });
});
