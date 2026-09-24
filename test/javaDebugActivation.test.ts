// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import * as telemetry from "vscode-extension-telemetry-wrapper";
import { activate } from "../src/extension";
import * as configurationProvider from "../src/configurationProvider";
import * as experimentation from "../src/experimentationService";
import * as languageModelTool from "../src/languageModelTool";
import * as chatTelemetry from "../src/lmToolTelemetry";
import { createFakeCollection } from "./helpers/environmentVariableCollection";

suite("Non-Java workspace activation", () => {
    test("registers core debugging without starting Java, then enables integrations after natural activation", async function() {
        this.timeout(10000);
        const cleanups: (() => void)[] = [];
        const override = (target: object, key: string, value: unknown) => {
            const descriptor = Object.getOwnPropertyDescriptor(target, key);
            assert.ok(descriptor);
            Object.defineProperty(target, key, { ...descriptor, value });
            cleanups.push(() => Object.defineProperty(target, key, descriptor));
        };
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "java-debug-activation-"));
        const extensionPath = path.resolve(__dirname, "../..");
        const collection = createFakeCollection();
        const commands = new Set<string>();
        const configurations: string[] = [];
        const adapters: string[] = [];
        let linkProviders = 0;
        let javaActive = false;
        let javaActivationCalls = 0;
        let sourceSubscriptions = 0;
        const errors: Error[] = [];
        const sourceInvalidated = new vscode.EventEmitter<{ affectedRootPaths?: string[] }>();
        const api = {
            javaRequirement: { java_home: path.join(tempDir, "jdk") },
            serverMode: "Standard",
            onDidSourceInvalidate: (listener: (event: { affectedRootPaths?: string[] }) => void) => {
                sourceSubscriptions += 1;
                const subscription = sourceInvalidated.event(listener);
                return new vscode.Disposable(() => {
                    sourceSubscriptions -= 1;
                    subscription.dispose();
                });
            },
        };
        let completeJavaActivation: (value: typeof api) => void = () => { };
        const pendingJavaActivation = new Promise<typeof api>((resolve) => { completeJavaActivation = resolve; });
        const javaExtension: vscode.Extension<typeof api> = {
            id: "redhat.java",
            extensionPath,
            extensionUri: vscode.Uri.file(extensionPath),
            packageJSON: {},
            extensionKind: vscode.ExtensionKind.Workspace,
            get isActive() { return javaActive; },
            get exports() {
                assert.ok(javaActive, "Do not access Java exports before activation");
                return api;
            },
            activate() {
                javaActivationCalls += 1;
                return pendingJavaActivation;
            },
        };
        const context: vscode.ExtensionContext = {
            subscriptions: [],
            extensionPath,
            extensionUri: vscode.Uri.file(extensionPath),
            storageUri: vscode.Uri.file(tempDir),
            environmentVariableCollection: { ...collection, getScoped: () => collection },
            extensionMode: vscode.ExtensionMode.Test,
            extension: javaExtension,
            asAbsolutePath: (relativePath) => path.join(extensionPath, relativePath),
            get workspaceState(): never { throw new Error("Unexpected workspace state access"); },
            get globalState(): never { throw new Error("Unexpected global state access"); },
            get secrets(): never { throw new Error("Unexpected secrets access"); },
            get storagePath(): never { throw new Error("Unexpected storage path access"); },
            get globalStorageUri(): never { throw new Error("Unexpected global storage URI access"); },
            get globalStoragePath(): never { throw new Error("Unexpected global storage path access"); },
            get logUri(): never { throw new Error("Unexpected log URI access"); },
            get logPath(): never { throw new Error("Unexpected log path access"); },
            get languageModelAccessInformation(): never { throw new Error("Unexpected language model access information"); },
        };
        let activation: ReturnType<typeof activate> | undefined;
        let timeout: NodeJS.Timeout | undefined;
        try {
            const document = await vscode.workspace.openTextDocument({ language: "typescript", content: "export const value = 1;" });
            await vscode.window.showTextDocument(document);
            override(vscode.extensions, "getExtension", (id: string) => {
                assert.strictEqual(id, "redhat.java");
                return javaExtension;
            });
            override(telemetry, "initializeFromJsonFile", async () => { });
            override(experimentation, "initExpService", async () => { });
            override(telemetry, "sendError", (error: Error) => errors.push(error));
            override(telemetry, "instrumentOperation", (
                _name: string, operation: (id: string, ...args: unknown[]) => unknown,
            ) => (...args: unknown[]) => operation("test", ...args));
            override(telemetry, "instrumentOperationAsVsCodeCommand", (command: string) => {
                commands.add(command);
                return new vscode.Disposable(() => { });
            });
            override(vscode.commands, "registerCommand", (command: string) => {
                commands.add(command);
                return new vscode.Disposable(() => { });
            });
            override(vscode.debug, "registerDebugConfigurationProvider", (type: string) => {
                configurations.push(type);
                return new vscode.Disposable(() => { });
            });
            override(configurationProvider, "JavaDebugConfigurationProvider", class { });
            override(vscode.debug, "registerDebugAdapterDescriptorFactory", (type: string) => {
                adapters.push(type);
                return new vscode.Disposable(() => { });
            });
            override(vscode.languages, "registerDocumentLinkProvider", () => {
                linkProviders += 1;
                return new vscode.Disposable(() => { });
            });
            override(languageModelTool, "registerLanguageModelTool", () => undefined);
            override(languageModelTool, "registerDebugSessionTools", () => []);
            override(chatTelemetry, "recordChatActivation", () => { });

            activation = activate(context);
            const result = await Promise.race([
                activation,
                new Promise<never>((_resolve, reject) => {
                    timeout = setTimeout(() => reject(new Error("Activation waited for Java")), 2000);
                }),
            ]);
            clearTimeout(timeout);
            assert.ok(result.progressProvider);
            assert.deepStrictEqual(configurations, ["java"]);
            assert.deepStrictEqual(adapters, ["java"]);
            assert.ok(commands.has("java.debug.debugJavaFile"));
            assert.ok(commands.has("java.debug.analyzeStackTrace"));
            assert.strictEqual(javaActivationCalls, 0);
            assert.strictEqual(linkProviders, 0);
            assert.strictEqual(sourceSubscriptions, 0);
            assert.ok(collection.get("PATH"));
            assert.strictEqual(collection.get("VSCODE_JAVA_EXEC"), undefined);
            assert.strictEqual(errors.length, 0);

            javaActive = true;
            completeJavaActivation(api);
            await new Promise((resolve) => setTimeout(resolve, 1100));
            assert.strictEqual(javaActivationCalls, 0);
            assert.strictEqual(linkProviders, 1);
            assert.strictEqual(sourceSubscriptions, 1);
            assert.strictEqual(collection.get("VSCODE_JAVA_EXEC")?.value, path.join(tempDir, "jdk", "bin", "java"));
            assert.strictEqual(errors.length, 0);
        } finally {
            if (timeout) {
                clearTimeout(timeout);
            }
            javaActive = true;
            completeJavaActivation(api);
            try {
                await activation;
            } finally {
                for (const disposable of context.subscriptions.reverse()) {
                    disposable.dispose();
                }
                sourceInvalidated.dispose();
                for (const cleanup of cleanups.reverse()) {
                    cleanup();
                }
                await fs.promises.rm(tempDir, { recursive: true, force: true });
            }
            assert.strictEqual(sourceSubscriptions, 0);
        }
    });
});
