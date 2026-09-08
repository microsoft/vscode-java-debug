// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import * as telemetry from "vscode-extension-telemetry-wrapper";

import { registerNoConfigDebug } from "../src/noConfigDebugInit";
import { buildNoConfigPathAppendValue } from "../src/pathUtil";
import * as utility from "../src/utility";
import { createFakeCollection, FakeCollection } from "./helpers/environmentVariableCollection";

suite("No-Config Debug workspace storage", () => {
    let tempDir: string;
    let extPath: string;
    let storageUri: vscode.Uri;
    let collection: FakeCollection;
    let errors: Error[];
    let warnings: string[];
    let patterns: vscode.GlobPattern[];
    let created: vscode.EventEmitter<vscode.Uri>;
    let changed: vscode.EventEmitter<vscode.Uri>;
    let watcherDisposed: boolean;
    let cleanups: (() => void)[];

    function replaceProperty<T, K extends keyof T>(target: T, key: K, value: T[K]): void {
        const descriptor = Object.getOwnPropertyDescriptor(target, key);
        assert.ok(descriptor);
        Object.defineProperty(target, key, { ...descriptor, value });
        cleanups.push(() => Object.defineProperty(target, key, descriptor));
    }

    async function register(storage: vscode.Uri | undefined = storageUri, enabled: boolean = true): Promise<vscode.Disposable | undefined> {
        const disposable = await registerNoConfigDebug(collection, extPath, storage, enabled);
        if (disposable) {
            cleanups.push(() => disposable.dispose());
        }
        return disposable;
    }

    function endpointPath(): string {
        const endpoint = collection.get("VSCODE_JDWP_ADAPTER_ENDPOINTS");
        assert.ok(endpoint);
        return endpoint.value;
    }

    function seedCachedEnvironment(): void {
        collection.description = "Java No-Config Debug";
        collection.replace("VSCODE_JDWP_ADAPTER_ENDPOINTS", path.join(extPath, "old-endpoint.txt"));
        collection.replace("VSCODE_JAVA_EXEC", "old-java");
        collection.append("PATH", buildNoConfigPathAppendValue(path.join(extPath, "old-scripts")));
        collection.replace("UNRELATED", "keep");
    }

    function assertUnavailable(disposable: vscode.Disposable | undefined, code: string): void {
        assert.strictEqual(disposable, undefined);
        assert.strictEqual(collection.get("VSCODE_JDWP_ADAPTER_ENDPOINTS"), undefined);
        assert.strictEqual(collection.get("VSCODE_JAVA_EXEC"), undefined);
        assert.strictEqual(collection.get("PATH"), undefined);
        assert.strictEqual(collection.description, undefined);
        assert.strictEqual(collection.get("UNRELATED")?.value, "keep");
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].message.includes(code));
        assert.strictEqual(errors[0].message.includes(tempDir), false);
        assert.strictEqual(warnings.length, 1);
        assert.ok(warnings[0].includes("Standard Java debugging is still available"));
    }

    setup(async () => {
        cleanups = [];
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "java-debug-storage-"));
        extPath = path.join(tempDir, "extension");
        storageUri = vscode.Uri.file(path.join(tempDir, "workspace-storage", "vscjava.vscode-java-debug"));
        const scriptsDir = path.join(extPath, "bundled", "scripts", "noConfigScripts");
        await fs.promises.mkdir(scriptsDir, { recursive: true });
        await fs.promises.writeFile(path.join(scriptsDir, "debugjava"), "#!/bin/bash\n", { mode: 0o755 });
        collection = createFakeCollection();
        errors = [];
        warnings = [];
        patterns = [];
        created = new vscode.EventEmitter<vscode.Uri>();
        changed = new vscode.EventEmitter<vscode.Uri>();
        watcherDisposed = false;
        cleanups.push(() => created.dispose(), () => changed.dispose());

        replaceProperty(utility, "getJavaHome", async () => path.join(tempDir, "jdk"));
        replaceProperty(telemetry, "sendError", (error) => { errors.push(error); });
        replaceProperty(telemetry, "sendInfo", () => { });
        replaceProperty(vscode.window, "showWarningMessage", async (message: string) => {
            warnings.push(message);
            return undefined;
        });
        replaceProperty(vscode.workspace, "createFileSystemWatcher", (pattern) => {
            patterns.push(pattern);
            return {
                ignoreCreateEvents: false,
                ignoreChangeEvents: false,
                ignoreDeleteEvents: false,
                onDidCreate: created.event,
                onDidChange: changed.event,
                onDidDelete: created.event,
                dispose: () => { watcherDisposed = true; },
            };
        });
    });

    teardown(async () => {
        for (const cleanup of cleanups.reverse()) {
            cleanup();
        }
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    test("skips all no-config setup and clears cached contributions when disabled", async () => {
        seedCachedEnvironment();
        let setupCalls = 0;
        const unexpectedSetup = (): never => {
            setupCalls += 1;
            throw new Error("No-config setup must not run when disabled");
        };
        replaceProperty(fs.promises, "mkdir", async () => unexpectedSetup());
        replaceProperty(fs.promises, "unlink", async () => unexpectedSetup());
        replaceProperty(fs.promises, "stat", async () => unexpectedSetup());
        replaceProperty(fs.promises, "chmod", async () => unexpectedSetup());
        replaceProperty(utility, "getJavaHome", async () => unexpectedSetup());
        replaceProperty(vscode.workspace, "createFileSystemWatcher", unexpectedSetup);
        replaceProperty(vscode.debug, "onDidTerminateDebugSession", unexpectedSetup);

        assert.strictEqual(await register(storageUri, false), undefined);
        assert.strictEqual(setupCalls, 0);
        assert.strictEqual(fs.existsSync(storageUri.fsPath), false);
        assert.strictEqual(collection.get("VSCODE_JDWP_ADAPTER_ENDPOINTS"), undefined);
        assert.strictEqual(collection.get("VSCODE_JAVA_EXEC"), undefined);
        assert.strictEqual(collection.get("PATH"), undefined);
        assert.strictEqual(collection.get("UNRELATED")?.value, "keep");
        assert.strictEqual(collection.description, undefined);
        assert.strictEqual(collection.__calls.delete, 3);
        assert.strictEqual(errors.length, 0);
        assert.strictEqual(warnings.length, 0);

        const callsAfterDisable = { ...collection.__calls };
        assert.strictEqual(await register(storageUri, false), undefined);
        assert.deepStrictEqual(collection.__calls, callsAfterDisable);
    });

    test("does not report a missing workspace when explicitly disabled", async () => {
        assert.strictEqual(await registerNoConfigDebug(collection, extPath, undefined, false), undefined);
        assert.strictEqual(errors.length, 0);
        assert.strictEqual(warnings.length, 0);
        assert.strictEqual(patterns.length, 0);
    });

    test("does not remove existing endpoint files when disabled", async () => {
        const endpoint = path.join(storageUri.fsPath, ".noConfigDebugAdapterEndpoints", "endpoint.txt");
        const data = JSON.stringify({ client: { port: 12345 } });
        await fs.promises.mkdir(path.dirname(endpoint), { recursive: true });
        await fs.promises.writeFile(endpoint, data);

        assert.strictEqual(await register(storageUri, false), undefined);
        assert.strictEqual(await fs.promises.readFile(endpoint, "utf8"), data);
        assert.strictEqual(patterns.length, 0);
    });

    test("restores terminal integration when re-enabled on a later activation", async () => {
        const first = await register();
        assert.ok(first);
        first.dispose();
        assert.strictEqual(await register(storageUri, false), undefined);

        assert.ok(await register(storageUri, true));
        assert.strictEqual(endpointPath(), path.join(storageUri.fsPath, ".noConfigDebugAdapterEndpoints", "endpoint.txt"));
        assert.strictEqual(collection.description, "Java No-Config Debug");
        assert.ok(collection.get("VSCODE_JAVA_EXEC"));
        assert.ok(collection.get("PATH"));
        assert.strictEqual(patterns.length, 2);
        assert.strictEqual(errors.length, 0);
    });

    test("creates private workspace storage and keeps bundled scripts in the installation directory", async () => {
        assert.ok(await register());
        assert.strictEqual(endpointPath(), path.join(storageUri.fsPath, ".noConfigDebugAdapterEndpoints", "endpoint.txt"));
        assert.strictEqual(fs.existsSync(path.join(extPath, ".noConfigDebugAdapterEndpoints")), false);
        assert.strictEqual(
            collection.get("PATH")?.value,
            buildNoConfigPathAppendValue(path.join(extPath, "bundled", "scripts", "noConfigScripts")),
        );
        assert.strictEqual(collection.get("VSCODE_JAVA_EXEC")?.value, path.join(tempDir, "jdk", "bin", "java"));
        assert.deepStrictEqual(patterns, [new vscode.RelativePattern(path.dirname(endpointPath()), "endpoint.txt")]);
        assert.strictEqual(errors.length, 0);
        if (process.platform !== "win32") {
            const permissions = (await fs.promises.stat(path.dirname(endpointPath()))).mode % 0o1000;
            assert.strictEqual(permissions, 0o700);
        }
    });

    test("works with a read-only extension directory on POSIX", async function() {
        if (process.platform === "win32") {
            this.skip();
        }
        await fs.promises.chmod(extPath, 0o555);
        try {
            assert.ok(await register());
            assert.strictEqual(fs.existsSync(path.join(extPath, ".noConfigDebugAdapterEndpoints")), false);
            assert.strictEqual(errors.length, 0);
        } finally {
            await fs.promises.chmod(extPath, 0o755);
        }
    });

    test("does not attempt to create endpoints through a dangling installation link", async () => {
        extPath = path.join(tempDir, "dangling-extension");
        await fs.promises.symlink(path.join(tempDir, "missing-target"), extPath, process.platform === "win32" ? "junction" : "dir");
        try {
            assert.ok(await register());
            assert.strictEqual(path.dirname(endpointPath()), path.join(storageUri.fsPath, ".noConfigDebugAdapterEndpoints"));
            assert.strictEqual(warnings.length, 0);
        } finally {
            await fs.promises.unlink(extPath);
        }
    });

    test("keeps the endpoint stable and does not mutate terminal variables on reload", async () => {
        const firstRegistration = await register();
        assert.ok(firstRegistration);
        const firstEndpoint = endpointPath();
        const initialCalls = { ...collection.__calls };
        firstRegistration.dispose();
        assert.strictEqual(watcherDisposed, true);

        assert.ok(await register());
        assert.strictEqual(endpointPath(), firstEndpoint);
        assert.deepStrictEqual(collection.__calls, initialCalls);
    });

    test("isolates endpoints between workspace storage directories", async () => {
        assert.ok(await register());
        const firstEndpoint = endpointPath();
        const otherStorage = vscode.Uri.file(path.join(tempDir, "other-workspace-storage"));
        assert.ok(await register(otherStorage));
        assert.notStrictEqual(endpointPath(), firstEndpoint);
        assert.strictEqual(path.dirname(endpointPath()), path.join(otherStorage.fsPath, ".noConfigDebugAdapterEndpoints"));
    });

    test("migrates cached terminal variables once without deleting unrelated contributions", async () => {
        seedCachedEnvironment();
        assert.ok(await register());
        assert.strictEqual(endpointPath(), path.join(storageUri.fsPath, ".noConfigDebugAdapterEndpoints", "endpoint.txt"));
        assert.strictEqual(collection.get("UNRELATED")?.value, "keep");
        assert.strictEqual(collection.__calls.delete, 0);
        const initialCalls = { ...collection.__calls };

        assert.ok(await register());
        assert.deepStrictEqual(collection.__calls, initialCalls);
    });

    test("finishes deleting a stale endpoint before creating the watcher", async () => {
        const endpoint = path.join(storageUri.fsPath, ".noConfigDebugAdapterEndpoints", "endpoint.txt");
        await fs.promises.mkdir(path.dirname(endpoint), { recursive: true });
        await fs.promises.writeFile(endpoint, JSON.stringify({ client: { port: 12345 } }));
        const originalCreateWatcher = vscode.workspace.createFileSystemWatcher;
        replaceProperty(vscode.workspace, "createFileSystemWatcher", (pattern) => {
            assert.strictEqual(fs.existsSync(endpoint), false);
            return originalCreateWatcher(pattern);
        });
        assert.ok(await register());
        assert.strictEqual(fs.existsSync(endpoint), false);
    });

    for (const code of ["ENOENT", "EACCES", "EROFS"]) {
        test(`isolates ${code} storage failures and clears only its cached terminal variables`, async () => {
            seedCachedEnvironment();
            replaceProperty(fs.promises, "mkdir", async () => {
                throw Object.assign(new Error(`mkdir '${storageUri.fsPath}'`), { code });
            });
            assertUnavailable(await register(), code);
            assert.strictEqual(patterns.length, 0);
        });
    }

    test("isolates stale-file cleanup failures instead of watching old endpoint data", async () => {
        seedCachedEnvironment();
        replaceProperty(fs.promises, "unlink", async () => {
            throw Object.assign(new Error(`unlink '${storageUri.fsPath}'`), { code: "EACCES" });
        });
        assertUnavailable(await register(), "EACCES");
        assert.strictEqual(patterns.length, 0);
    });

    test("isolates watcher initialization failures before publishing the endpoint", async () => {
        seedCachedEnvironment();
        replaceProperty(vscode.workspace, "createFileSystemWatcher", () => {
            throw new Error(`Cannot watch '${storageUri.fsPath}'`);
        });
        assertUnavailable(await register(), "unknown");
    });

    test("skips an empty window without falling back to the installation directory", async () => {
        seedCachedEnvironment();
        const disposable = await registerNoConfigDebug(collection, extPath, undefined);
        assert.strictEqual(disposable, undefined);
        assert.strictEqual(collection.get("VSCODE_JDWP_ADAPTER_ENDPOINTS"), undefined);
        assert.strictEqual(collection.get("VSCODE_JAVA_EXEC"), undefined);
        assert.strictEqual(collection.get("PATH"), undefined);
        assert.strictEqual(collection.get("UNRELATED")?.value, "keep");
        assert.strictEqual(patterns.length, 0);
        assert.strictEqual(fs.existsSync(storageUri.fsPath), false);
        assert.strictEqual(errors.length, 1);
        assert.strictEqual(warnings.length, 0);
    });

    for (const eventType of ["create", "change"]) {
        test(`handles endpoint ${eventType} events while Java-home resolution is pending`, async function() {
            this.timeout(5000);
            const endpoint = path.join(storageUri.fsPath, ".noConfigDebugAdapterEndpoints", "endpoint.txt");
            if (eventType === "change") {
                seedCachedEnvironment();
                collection.replace("VSCODE_JDWP_ADAPTER_ENDPOINTS", endpoint);
            }

            let releaseJavaHome: (javaHome: string) => void = () => { };
            const pendingJavaHome = new Promise<string>((resolve) => { releaseJavaHome = resolve; });
            let notifyJavaHomeRequested: () => void = () => { };
            const javaHomeRequested = new Promise<void>((resolve) => { notifyJavaHomeRequested = resolve; });
            replaceProperty(utility, "getJavaHome", () => {
                notifyJavaHomeRequested();
                return pendingJavaHome;
            });

            let registrationFinished = false;
            const registration = register().then((disposable) => {
                registrationFinished = true;
                return disposable;
            });
            let timeout: NodeJS.Timeout | undefined;
            try {
                await javaHomeRequested;
                assert.strictEqual(endpointPath(), endpoint);
                const attached = new Promise<vscode.DebugConfiguration | string>((resolve, reject) => {
                    replaceProperty(vscode.debug, "startDebugging", async (_folder, debugConfiguration) => {
                        resolve(debugConfiguration);
                        return true;
                    });
                    timeout = setTimeout(() => reject(new Error(`Endpoint ${eventType} event was lost during initialization`)), 1500);
                });
                const originalUnlink = fs.promises.unlink;
                let finishCleanup: () => void = () => { };
                const cleanedUp = new Promise<void>((resolve) => { finishCleanup = resolve; });
                replaceProperty(fs.promises, "unlink", async (file) => {
                    await originalUnlink(file);
                    finishCleanup();
                });

                await fs.promises.writeFile(endpoint, JSON.stringify({ client: { host: "localhost", port: 54321 } }));
                const emitter = eventType === "create" ? created : changed;
                emitter.fire(vscode.Uri.file(endpoint));
                const configuration = await attached;
                assert.ok(typeof configuration !== "string");
                assert.strictEqual(configuration.request, "attach");
                assert.strictEqual(configuration.port, 54321);
                assert.strictEqual(registrationFinished, false);
                await cleanedUp;
                assert.strictEqual(fs.existsSync(endpoint), false);
                assert.strictEqual(errors.length, 0);
            } finally {
                if (timeout) {
                    clearTimeout(timeout);
                }
                releaseJavaHome(path.join(tempDir, "jdk"));
                await registration;
            }
        });
    }

    test("reads the port from workspace storage, attaches, and removes the endpoint", async () => {
        assert.ok(await register());
        const endpoint = endpointPath();
        const configurations: (vscode.DebugConfiguration | string)[] = [];
        replaceProperty(vscode.debug, "startDebugging", async (_folder, configuration) => {
            configurations.push(configuration);
            return true;
        });
        const originalUnlink = fs.promises.unlink;
        let finishCleanup: () => void = () => { };
        const cleanedUp = new Promise<void>((resolve) => { finishCleanup = resolve; });
        replaceProperty(fs.promises, "unlink", async (file) => {
            await originalUnlink(file);
            finishCleanup();
        });

        await fs.promises.writeFile(endpoint, JSON.stringify({ client: { host: "localhost", port: 54321 } }));
        created.fire(vscode.Uri.file(endpoint));
        await cleanedUp;

        assert.deepStrictEqual(configurations, [{
            type: "java",
            request: "attach",
            name: "Attach to Java (No-Config)",
            hostName: "localhost",
            port: 54321,
        }]);
        assert.strictEqual(fs.existsSync(endpoint), false);
        assert.strictEqual(errors.length, 0);
    });
});
