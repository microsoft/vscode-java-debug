// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { CancellationTokenSource, workspace } from "vscode";

import { JavaStackTraceLinkProvider } from "../src/stackTraceLinkProvider";

suite("JavaStackTraceLinkProvider", () => {
    test("encodes command URI arguments as an array", async () => {
        const stackTrace = "com.example.App.main(App.java:42)";
        const document = await workspace.openTextDocument({
            language: "log",
            content: `\tat ${stackTrace}`,
        });
        const cancellation = new CancellationTokenSource();

        try {
            const links = await Promise.resolve(
                new JavaStackTraceLinkProvider().provideDocumentLinks(document, cancellation.token),
            );
            assert.ok(links);
            assert.strictEqual(links.length, 1);

            const target = links[0].target;
            assert.ok(target);
            assert.deepStrictEqual(JSON.parse(decodeURIComponent(target.query)), [{
                stackTrace,
                methodName: "com.example.App.main",
                lineNumber: 42,
            }]);
        } finally {
            cancellation.dispose();
        }
    });
});
