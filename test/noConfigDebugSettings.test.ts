// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as telemetry from "vscode-extension-telemetry-wrapper";

import { ENABLE_NO_CONFIG_DEBUG } from "../src/constants";
import { registerLanguageModelTool } from "../src/languageModelTool";

suite("No-Config Debug setting", () => {
    test("is a default-enabled window-scoped setting with localized descriptions", async () => {
        const repoRoot = path.resolve(__dirname, "../..");
        const manifest = JSON.parse(await fs.promises.readFile(path.join(repoRoot, "package.json"), "utf8"));
        const setting = manifest.contributes.configuration.properties[ENABLE_NO_CONFIG_DEBUG];
        assert.strictEqual(setting.type, "boolean");
        assert.strictEqual(setting.default, true);
        assert.strictEqual(setting.scope, "window");
        assert.strictEqual(vscode.workspace.getConfiguration().inspect<boolean>(ENABLE_NO_CONFIG_DEBUG)?.defaultValue, true);

        const descriptionKey = "java.debugger.configuration.enableNoConfigDebug.description";
        assert.strictEqual(setting.description, `%${descriptionKey}%`);
        for (const file of ["package.nls.json", "package.nls.zh-cn.json", "package.nls.zh-tw.json", "package.nls.es.json", "package.nls.it.json"]) {
            const translations = JSON.parse(await fs.promises.readFile(path.join(repoRoot, file), "utf8"));
            assert.strictEqual(typeof translations[descriptionKey], "string", file);
            assert.ok(translations[descriptionKey].includes("debugjava"), file);
        }
    });
});

suite("No-Config Debug AI opt-out", () => {
    let registeredTool: vscode.LanguageModelTool<unknown> | undefined;
    let registeredName: string | undefined;
    let cleanups: (() => void)[];
    let sideEffects: number;

    function overrideProperty(target: object, key: string, descriptor: PropertyDescriptor): void {
        const original = Object.getOwnPropertyDescriptor(target, key);
        assert.ok(original);
        Object.defineProperty(target, key, { configurable: true, ...descriptor });
        cleanups.push(() => Object.defineProperty(target, key, original));
    }

    setup(() => {
        registeredTool = undefined;
        registeredName = undefined;
        cleanups = [];
        sideEffects = 0;
        const registerTool: typeof vscode.lm.registerTool = (name, tool) => {
            registeredName = name;
            registeredTool = tool;
            return new vscode.Disposable(() => { });
        };
        overrideProperty(vscode.lm, "registerTool", { value: registerTool });
        overrideProperty(telemetry, "sendInfo", { value: () => { } });
        const unexpectedSideEffect = (): never => {
            sideEffects += 1;
            throw new Error("The AI launch tool must not touch sessions, terminals, or builds when disabled");
        };
        overrideProperty(vscode.debug, "activeDebugSession", { get: unexpectedSideEffect });
        overrideProperty(vscode.debug, "stopDebugging", { value: unexpectedSideEffect });
        overrideProperty(vscode.window, "terminals", { get: unexpectedSideEffect });
        overrideProperty(vscode.window, "createTerminal", { value: unexpectedSideEffect });
        overrideProperty(vscode.commands, "executeCommand", { value: unexpectedSideEffect });
    });

    teardown(() => {
        for (const cleanup of cleanups.reverse()) {
            cleanup();
        }
    });

    test("returns opt-in guidance before inspecting inputs or changing sessions and terminals", async () => {
        overrideProperty(vscode.workspace, "getConfiguration", {
            value: () => {
                throw new Error("The launch tool must use the activation snapshot instead of reading live settings");
            },
        });
        const context: Pick<vscode.ExtensionContext, "subscriptions"> = { subscriptions: [] };
        const disposable = registerLanguageModelTool(context, false);
        assert.ok(disposable);
        cleanups.push(() => disposable.dispose());
        assert.strictEqual(context.subscriptions[0], disposable);
        assert.strictEqual(registeredName, "debug_java_application");
        assert.ok(registeredTool);

        const input = {
            get target(): string {
                throw new Error("Disabled launch must not inspect or build the target");
            },
            get workspacePath(): string {
                throw new Error("Disabled launch must not inspect the workspace");
            },
        };
        const cancellation = new vscode.CancellationTokenSource();
        cleanups.push(() => cancellation.dispose());
        const result = await registeredTool.invoke({ input, toolInvocationToken: undefined }, cancellation.token);
        assert.ok(result instanceof vscode.LanguageModelToolResult);
        const text = result.content[0];
        assert.ok(text instanceof vscode.LanguageModelTextPart);
        assert.ok(text.value.includes(ENABLE_NO_CONFIG_DEBUG));
        assert.ok(text.value.includes("reload VS Code"));
        assert.ok(text.value.includes("recreate existing terminals"));
        assert.ok(text.value.includes("Standard Java launch/attach debugging remains available"));
        assert.strictEqual(sideEffects, 0);
    });

    test("keeps the existing launch flow enabled by default", async () => {
        const context: Pick<vscode.ExtensionContext, "subscriptions"> = { subscriptions: [] };
        const disposable = registerLanguageModelTool(context);
        assert.ok(disposable);
        cleanups.push(() => disposable.dispose());
        assert.ok(registeredTool);
        const cancellation = new vscode.CancellationTokenSource();
        cancellation.cancel();
        cleanups.push(() => cancellation.dispose());

        const result = await registeredTool.invoke({
            input: { target: "Main", workspacePath: "unused" },
            toolInvocationToken: undefined,
        }, cancellation.token);
        assert.ok(result instanceof vscode.LanguageModelToolResult);
        const text = result.content[0];
        assert.ok(text instanceof vscode.LanguageModelTextPart);
        assert.ok(text.value.includes("Operation cancelled by user"));
        assert.strictEqual(text.value.includes(ENABLE_NO_CONFIG_DEBUG), false);
        assert.strictEqual(sideEffects, 0);
    });
});
