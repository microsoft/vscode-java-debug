// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { DebugConfiguration, window } from "vscode";
import { getProcesses, getProcessTree } from "./processTree";

const JAVA_PATTERN = /(?:java|javaw|j9|j9w)$/i;
const DEBUG_MODE_PATTERN = /(-agentlib|-Xrunjdwp):\S*(address=[^\s,]+)/i;

interface IJavaProcess {
    pid: number;
    command: string;
    args: string;
    hostName: string;
    debugPort: number;
}

export async function resolveProcessId(config: DebugConfiguration): Promise<boolean> {
    let javaProcess;
    // tslint:disable-next-line
    if (!config.processId || config.processId === "${command:PickJavaProcess}") {
        javaProcess = await pickJavaProcess();
    } else {
        javaProcess = await resolveJavaProcess(parseInt(String(config.processId), 10));
        if (!javaProcess) {
            throw new Error(`Attach to process: pid '${config.processId}' doesn't look like a debuggable Java process. `
                + `Please ensure the process has enabled debug mode with vmArgs like `
                + `'-agentlib:jdwp=transport=dt_socket,server=y,address=5005.'`);
        }
    }

    if (javaProcess) {
        config.processId = undefined;
        config.hostName = javaProcess.hostName;
        config.port = javaProcess.debugPort;
    }

    return !!javaProcess;
}

function convertToJavaProcess(pid: number, command: string, args: string): IJavaProcess | undefined {
    if (process.platform === "win32" && command.indexOf("\\??\\") === 0) {
        // remove leading device specifier
        command = command.replace("\\??\\", "");
    }

    const simpleName = path.basename(command, ".exe");
    if (JAVA_PATTERN.test(simpleName) && args) {
        const match = args.match(DEBUG_MODE_PATTERN);
        if (match && match.length) {
            const address = match[2].split("=")[1].split(":");
            const hostName = address.length > 1 ? address[0] : "127.0.0.1";
            const debugPort = parseInt(address[address.length - 1], 10);
            const exeName = path.basename(command);
            const binPath = path.dirname(command);
            const commandPath = path.basename(binPath) === "bin" ?
                path.join(path.basename(path.dirname(binPath)), "bin", exeName) : exeName;
            return {
                pid,
                command: commandPath,
                args,
                hostName,
                debugPort,
            };
        }
    }
}

async function pickJavaProcess(): Promise<IJavaProcess> {
    try {
        const javaProcesses: IJavaProcess[] = [];
        await getProcesses((pid: number, ppid: number, command: string, args: string, date: number) => {
            const javaProcess = convertToJavaProcess(pid, command, args);
            if (javaProcess) {
                javaProcesses.push(javaProcess);
            }
        });

        if (!javaProcesses.length) {
            throw new Error("Process picker: No debuggable Java process found. Please ensure enable debugging for "
                + "your application with vmArgs like '-agentlib:jdwp=transport=dt_socket,server=y,address=5005'.");
        }

        const items = javaProcesses.map((process) => {
            return {
                label: process.command,
                description: process.args,
                detail: `process id: ${process.pid}, debug port: ${process.debugPort}`,
                process,
            };
        });

        const pick = await window.showQuickPick(items, {
            placeHolder: "Pick Java process to attach to",
        });

        if (pick) {
            return pick.process;
        }
    } catch (error) {
        throw new Error("Process picker failed: " + error);
    }
}

async function resolveJavaProcess(pid: number): Promise<IJavaProcess | undefined> {
    const processTree = await getProcessTree(pid);
    if (!processTree || processTree.pid !== pid) {
        return undefined;
    }

    return convertToJavaProcess(processTree.pid, processTree.command, processTree.args);
}
