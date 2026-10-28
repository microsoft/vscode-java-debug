// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as childProcess from "child_process";
import { EventEmitter } from "events";
import * as path from "path";
import { PassThrough } from "stream";

import { getProcesses, getProcessTree } from "../src/processTree";

suite("Windows process enumeration", () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
    const spawnDescriptor = Object.getOwnPropertyDescriptor(childProcess, "spawn")!;
    let child: EventEmitter;
    let stdout: PassThrough;
    let stderr: PassThrough;
    let executable: string;
    let spawnArguments: readonly string[];
    let options: childProcess.SpawnOptions;

    const javaProcess = {
        ProcessId: 101,
        ParentProcessId: 42,
        CommandLine: '"C:\\Program Files\\Java\\bin\\java.exe" -agentlib:jdwp=transport=dt_socket,server=y,address=5005 Main',
        CreationDate: 20261028164300,
    };

    setup(() => {
        child = new EventEmitter();
        stdout = new PassThrough();
        stderr = new PassThrough();
        Object.defineProperty(process, "platform", { value: "win32" });
        Object.defineProperty(childProcess, "spawn", {
            value: (command: string, args: readonly string[], spawnOptions: childProcess.SpawnOptions) => {
                executable = command;
                spawnArguments = args;
                options = spawnOptions;
                return { stdout, stderr, on: child.on.bind(child) };
            },
        });
    });

    teardown(() => {
        Object.defineProperty(process, "platform", platformDescriptor);
        Object.defineProperty(childProcess, "spawn", spawnDescriptor);
        stdout.destroy();
        stderr.destroy();
    });

    function complete(output: string): void {
        stdout.write(output);
        child.emit("close", 0, null);
    }

    test("uses system Windows PowerShell without profiles or a visible window", async () => {
        const pending = getProcesses(() => undefined);
        assert.strictEqual(executable, path.join(process.env.WINDIR || "C:\\Windows",
            "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
        assert.deepStrictEqual(spawnArguments.slice(0, 4), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
        assert.ok(spawnArguments[4].includes("Get-CimInstance Win32_Process"));
        assert.ok(spawnArguments[4].includes("ConvertTo-Json -InputObject $processes -Compress"));
        assert.ok(spawnArguments[4].includes("$ErrorActionPreference = 'Stop'"));
        assert.ok(spawnArguments[4].includes("[Console]::OutputEncoding"));
        assert.deepStrictEqual(options, { windowsHide: true });
        complete("[]");
        await pending;
    });

    test("preserves quoted executable paths, JDWP arguments, IDs and creation dates", async () => {
        const actual: unknown[][] = [];
        const pending = getProcesses((...entry) => actual.push(entry));
        complete(JSON.stringify([javaProcess]));
        await pending;
        assert.deepStrictEqual(actual, [[101, 42, "C:\\Program Files\\Java\\bin\\java.exe",
            "-agentlib:jdwp=transport=dt_socket,server=y,address=5005 Main", 20261028164300]]);
    });

    test("parses multiple processes and skips unavailable or empty command lines", async () => {
        const actual: unknown[][] = [];
        const pending = getProcesses((...entry) => actual.push(entry));
        complete(JSON.stringify([
            { ...javaProcess, CommandLine: null },
            { ...javaProcess, CommandLine: "  " },
            { ...javaProcess, CommandLine: "C:\\Java\\bin\\java.exe\t  Main", CreationDate: null },
            { ...javaProcess, ProcessId: 102, CommandLine: "java.exe" },
            { ...javaProcess, ProcessId: 103, CommandLine: '"C:\\Program Files\\Java\\bin\\java.exe"' },
        ]));
        await pending;
        assert.deepStrictEqual(actual, [
            [101, 42, "C:\\Java\\bin\\java.exe", "Main", undefined],
            [102, 42, "java.exe", "", 20261028164300],
            [103, 42, "C:\\Program Files\\Java\\bin\\java.exe", "", 20261028164300],
        ]);
    });

    test("decodes chunked UTF-8 output without requiring a final newline", async () => {
        const commandLine = 'java.exe -Dmessage="\u4f60\u597d \\"quoted\\"" Main';
        const output = Buffer.from(JSON.stringify([{ ...javaProcess, CommandLine: commandLine }]), "utf8");
        const split = output.indexOf(Buffer.from("\u4f60", "utf8")) + 1;
        const actual: string[] = [];
        const pending = getProcesses((_pid, _ppid, _command, args) => actual.push(args));
        stdout.write(output.slice(0, split));
        stdout.write(output.slice(split));
        child.emit("close", 0, null);
        await pending;
        assert.deepStrictEqual(actual, [commandLine.slice("java.exe ".length)]);
    });

    test("accepts an empty process list", async () => {
        let count = 0;
        const pending = getProcesses(() => count++);
        complete("[]\r\n");
        await pending;
        assert.strictEqual(count, 0);
    });

    for (const output of ["", "not JSON", "{}", JSON.stringify([null]),
        JSON.stringify([{ ...javaProcess, ProcessId: "101" }]),
        JSON.stringify([{ ...javaProcess, CommandLine: 123 }])]) {
        test(`rejects invalid process output: ${output}`, async () => {
            const pending = getProcesses(() => undefined);
            complete(output);
            await assert.rejects(pending);
        });
    }

    test("rejects PowerShell startup failures", async () => {
        const pending = getProcesses(() => undefined);
        child.emit("error", new Error("PowerShell unavailable"));
        await assert.rejects(pending, /PowerShell unavailable/);
    });

    test("rejects CIM query errors reported on stderr", async () => {
        const pending = getProcesses(() => undefined);
        stderr.write("Get-CimInstance: Access denied");
        child.emit("close", 1, null);
        await assert.rejects(pending, /Access denied/);
    });

    test("rejects a nonzero exit even when stdout contains valid JSON", async () => {
        let count = 0;
        const pending = getProcesses(() => count++);
        stdout.write(JSON.stringify([javaProcess]));
        child.emit("close", 1, null);
        await assert.rejects(pending, /exit code: 1/);
        assert.strictEqual(count, 0);
    });

    test("builds the tree used to resolve an explicit process ID", async () => {
        const pending = getProcessTree(42);
        complete(JSON.stringify([
            { ...javaProcess, ProcessId: 42, ParentProcessId: 0, CommandLine: "parent.exe" },
            javaProcess,
        ]));
        const root = await pending;
        assert.strictEqual(root?.pid, 42);
        assert.strictEqual(root.children?.[0].pid, 101);
        assert.strictEqual(root.children?.[0].command, "C:\\Program Files\\Java\\bin\\java.exe");
        assert.ok(root.children?.[0].args.includes("address=5005"));
    });
});

suite("Windows process enumeration integration", () => {
    test("enumerates the current process without WMIC", async function() {
        if (process.platform !== "win32") {
            this.skip();
        }
        this.timeout(30000);
        const processes: number[] = [];
        await getProcesses((pid) => processes.push(pid));
        assert.ok(processes.includes(process.pid));
        const root = await getProcessTree(process.pid);
        assert.strictEqual(root?.pid, process.pid);
        assert.ok(root.command.length > 0);
    });
});
