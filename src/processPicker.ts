// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { window } from "vscode";
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

    return undefined;
}

export async function pickJavaProcess(): Promise<IJavaProcess | undefined> {
    const javaProcesses: IJavaProcess[] = [];
    try {
        await getProcesses((pid: number, _ppid: number, command: string, args: string, _date: number) => {
            const javaProcess = convertToJavaProcess(pid, command, args);
            if (javaProcess) {
                javaProcesses.push(javaProcess);
            }
        });
    } catch (error) {
        throw new Error("Process picker failed: " + error);
    }

    if (!javaProcesses.length) {
        throw new Error("Process picker: Cannot find any debuggable Java process. Please make sure to use vmArgs like "
            + "'-agentlib:jdwp=transport=dt_socket,server=y,address=5005' to turn on debug mode when you start your "
            + "program.");
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

    return undefined;
}

export async function resolveJavaProcess(pid: number): Promise<IJavaProcess | undefined> {
    const processTree = await getProcessTree(pid);
    if (!processTree || processTree.pid !== pid) {
        return undefined;
    }

    return convertToJavaProcess(processTree.pid, processTree.command, processTree.args);
}
