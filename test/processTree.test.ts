// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as childProcess from "child_process";
import { EventEmitter } from "events";
import { join } from "path";
import { PassThrough } from "stream";
import { getProcesses } from "../src/processTree";

suite("Windows process discovery", () => {
    const windowsTest = process.platform === "win32" ? test : test.skip;
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
    const spawnDescriptor = Object.getOwnPropertyDescriptor(childProcess, "spawn")!;
    const commandLine = '"C:\\\u5de5\u5177\\jdk\\bin\\java.exe" -agentlib:jdwp=transport=dt_socket,address=5005 \u5e94\u7528';
    let child: EventEmitter & { stdout: PassThrough; stderr: PassThrough };
    let executable: string;
    let spawnArgs: string[];
    let spawnOptions: childProcess.SpawnOptions | undefined;

    setup(() => {
        child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
        executable = "";
        spawnArgs = [];
        spawnOptions = undefined;
        Object.defineProperty(process, "platform", { ...platformDescriptor, value: "win32" });
        Object.defineProperty(childProcess, "spawn", {
            ...spawnDescriptor,
            value: (command: string, args: string[], options?: childProcess.SpawnOptions) => {
                executable = command;
                spawnArgs = args;
                spawnOptions = options;
                return child;
            },
        });
    });

    teardown(() => {
        Object.defineProperty(childProcess, "spawn", spawnDescriptor);
        Object.defineProperty(process, "platform", platformDescriptor);
        child.stdout.destroy();
        child.stderr.destroy();
    });

    test("runs Windows PowerShell without profiles, banners, or interaction", async () => {
        const discovery = getProcesses(() => { });
        child.emit("close", 0, null);
        await discovery;

        assert.strictEqual(executable, join(process.env.WINDIR || "C:\\Windows",
            "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
        assert.deepStrictEqual(spawnArgs.slice(0, -1), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
        assert.deepStrictEqual(spawnOptions, { windowsHide: true });
    });

    test("preserves Unicode command lines split across UTF-8 chunks", async () => {
        const processes: { pid: number; ppid: number; command: string; args: string }[] = [];
        const discovery = getProcesses((pid, ppid, command, args) => processes.push({ pid, ppid, command, args }));
        const output = Buffer.from(`${commandLine} 7 42\r\n`);
        child.stdout.write(output.slice(0, 5));
        child.stdout.write(output.slice(5, output.length - 1));
        child.stdout.write(output.slice(output.length - 1));
        child.emit("close", 0, null);
        await discovery;

        assert.deepStrictEqual(processes, [{
            pid: 42,
            ppid: 7,
            command: "C:\\\u5de5\u5177\\jdk\\bin\\java.exe",
            args: "-agentlib:jdwp=transport=dt_socket,address=5005 \u5e94\u7528",
        }]);
    });

    test("surfaces PowerShell errors instead of reporting an empty process list", async () => {
        const discovery = getProcesses(() => assert.fail("Unexpected process"));
        child.stderr.write("UTF-8 process discovery is restricted by policy.");
        child.emit("close", 1, null);
        await assert.rejects(discovery, /UTF-8 process discovery is restricted by policy/);
    });

    test("rejects unsuccessful PowerShell exits without stderr", async () => {
        const discovery = getProcesses(() => { });
        child.emit("close", 1, null);
        await assert.rejects(discovery, /process terminated with exit code: 1/);
    });

    test("rejects PowerShell launch failures", async () => {
        const discovery = getProcesses(() => { });
        const error = new Error("PowerShell could not be started");
        child.emit("error", error);
        await assert.rejects(discovery, (actual: unknown) => actual === error);
    });

    async function runScript(prefix: string): Promise<childProcess.SpawnSyncReturns<string>> {
        const discovery = getProcesses(() => { });
        child.emit("close", 0, null);
        await discovery;
        const result = childProcess.spawnSync(executable,
            [...spawnArgs.slice(0, -1), prefix + spawnArgs[spawnArgs.length - 1]],
            { encoding: "utf8", timeout: 10000, windowsHide: true });
        assert.ifError(result.error);
        return result;
    }

    function fixture(codePage: number, languageMode: "FullLanguage" | "ConstrainedLanguage"): string {
        return [
            `[Console]::OutputEncoding = [System.Text.Encoding]::GetEncoding(${codePage});`,
            `$record = [pscustomobject]@{ CommandLine = '${commandLine}'; ParentProcessId = 7; ProcessId = 42 };`,
            "function Get-CimInstance { $record };",
            `$ExecutionContext.SessionState.LanguageMode = '${languageMode}'; `,
        ].join(" ");
    }

    windowsTest("converts a legacy code page to UTF-8 in FullLanguage mode", async function() {
        this.timeout(15000);
        const result = await runScript(fixture(437, "FullLanguage"));
        assert.strictEqual(result.status, 0, result.stderr);
        assert.strictEqual(result.stderr, "");
        assert.strictEqual(result.stdout, `${commandLine} 7 42\r\n`);
    });

    windowsTest("preserves UTF-8 output in ConstrainedLanguage mode", async function() {
        this.timeout(15000);
        const result = await runScript(fixture(65001, "ConstrainedLanguage"));
        assert.strictEqual(result.status, 0, result.stderr);
        assert.strictEqual(result.stderr, "");
        assert.strictEqual(result.stdout, `${commandLine} 7 42\r\n`);
    });

    windowsTest("rejects legacy encoding in ConstrainedLanguage mode with actionable guidance", async function() {
        this.timeout(15000);
        const result = await runScript(fixture(437, "ConstrainedLanguage"));
        assert.strictEqual(result.status, 1);
        assert.strictEqual(result.stdout, "");
        assert.ok(result.stderr.replace(/\s+/g, " ").includes(
            "UTF-8 process discovery is restricted by policy. Attach using hostName and port instead."), result.stderr);
    });

    windowsTest("terminates on non-terminating CIM errors", async function() {
        this.timeout(15000);
        const result = await runScript("function Get-CimInstance { Write-Error 'CIM discovery failed' }; ");
        assert.strictEqual(result.status, 1);
        assert.strictEqual(result.stdout, "");
        assert.ok(result.stderr.includes("CIM discovery failed"), result.stderr);
    });
});
