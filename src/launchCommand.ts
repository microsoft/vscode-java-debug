// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as cp from "child_process";
import * as _ from "lodash";
import * as path from "path";
import * as vscode from "vscode";

import { inferLaunchCommandLength } from "./languageServerPlugin";
import { getJavaHome } from "./utility";

enum shortenApproach {
    none = "none",
    jarmanifest = "jarmanifest",
    argfile = "argfile",
}

export async function detectLaunchCommandStyle(config: vscode.DebugConfiguration): Promise<shortenApproach> {
    const javaExec: string = config.javaExec || path.join(await getJavaHome(), "bin", "java");
    const javaVersion = await checkJavaVersion(javaExec);
    const recommendedShortenApproach = javaVersion <= 8 ? shortenApproach.jarmanifest : shortenApproach.argfile;
    return (await shouldShortenIfNecessary(config)) ? recommendedShortenApproach : shortenApproach.none;
}

function checkJavaVersion(javaExec: string): Promise<number> {
    return new Promise((resolve, reject) => {
        cp.execFile(javaExec, ["-version"], {}, (error, stdout, stderr) => {
            const javaVersion = parseMajorVersion(stderr);
            resolve(javaVersion);
        });
    });
}

function parseMajorVersion(content: string): number {
    let regexp = /version "(.*)"/g;
    let match = regexp.exec(content);
    if (!match) {
        return 0;
    }
    let version = match[1];
    // Ignore '1.' prefix for legacy Java versions
    if (version.startsWith("1.")) {
        version = version.substring(2);
    }

    // look into the interesting bits now
    regexp = /\d+/g;
    match = regexp.exec(version);
    let javaVersion = 0;
    if (match) {
        javaVersion = parseInt(match[0], 10);
    }
    return javaVersion;
}

async function shouldShortenIfNecessary(config: vscode.DebugConfiguration): Promise<boolean> {
    const cliLength = await inferLaunchCommandLength(config);
    const classPaths = config.classPaths || [];
    const modulePaths = config.modulePaths || [];
    const classPathLength = classPaths.join(path.delimiter).length;
    const modulePathLength = modulePaths.join(path.delimiter).length;
    if (!config.console || config.console === "internalConsole") {
        return cliLength >= getMaxProcessCommandLineLength(config) || classPathLength >= getMaxArgLength() || modulePathLength >= getMaxArgLength();
    } else {
        return classPaths.length > 1 || modulePaths.length > 1;
    }
}

function getMaxProcessCommandLineLength(config: vscode.DebugConfiguration): number {
    const ARG_MAX_WINDOWS = 32768;
    const ARG_MAX_MACOS = 262144;
    const ARG_MAX_LINUX = 2097152;
    // for Posix systems, ARG_MAX is the maximum length of argument to the exec functions including environment data.
    // POSIX suggests to subtract 2048 additionally so that the process may safely modify its environment.
    // see https://www.in-ulm.de/~mascheck/various/argmax/
    if (process.platform === "win32") {
        // https://blogs.msdn.microsoft.com/oldnewthing/20031210-00/?p=41553/
        // On windows, the max process commmand line length is 32k (32768) characters.
        return ARG_MAX_WINDOWS - 2048;
    } else if (process.platform === "darwin") {
        return ARG_MAX_MACOS - getEnvironmentLength(config) - 2048;
    } else if (process.platform === "linux") {
        return ARG_MAX_LINUX - getEnvironmentLength(config) - 2048;
    }

    return Number.MAX_SAFE_INTEGER;
}

function getEnvironmentLength(config: vscode.DebugConfiguration): number {
    const env = config.env || {};
    return _.isEmpty(env) ? 0 : Object.keys(env).map((key) => strlen(key) + strlen(env[key]) + 1).reduce((a, b) => a + b);
}

function strlen(str: string): number {
    return str ? str.length : 0;
}

function getMaxArgLength(): number {
    const MAX_ARG_STRLEN_LINUX  = 131072;
    if (process.platform === "linux") {
        // On Linux, MAX_ARG_STRLEN (kernel >= 2.6.23) is the maximum length of a command line argument (or environment variable). Its value
        // cannot be changed without recompiling the kernel.
        return MAX_ARG_STRLEN_LINUX - 2048;
    }

    return Number.MAX_SAFE_INTEGER;
}
