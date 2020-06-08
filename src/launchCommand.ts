// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as cp from "child_process";
import * as _ from "lodash";
import * as path from "path";
import * as vscode from "vscode";

import { UNSUPPORTED_CLASS_VERSION_ERROR } from "./anchor";
import { fetchPlatformSettings, inferLaunchCommandLength } from "./languageServerPlugin";
import { getJavaHome, showWarningMessageWithTroubleshooting } from "./utility";

enum shortenApproach {
    none = "none",
    jarmanifest = "jarmanifest",
    argfile = "argfile",
}

const HELPFUL_NPE_VMARGS = "-XX:+ShowCodeDetailsInExceptionMessages";

export async function detectLaunchCommandStyle(config: vscode.DebugConfiguration): Promise<shortenApproach> {
    const javaExec: string = config.javaExec || path.join(await getJavaHome(), "bin", "java");
    const javaVersion = await checkJavaVersion(javaExec);
    const recommendedShortenApproach = javaVersion <= 8 ? shortenApproach.jarmanifest : shortenApproach.argfile;
    return (await shouldShortenIfNecessary(config)) ? recommendedShortenApproach : shortenApproach.none;
}

export async function validateRuntime(config: vscode.DebugConfiguration) {
    try {
        const platformSettings = await fetchPlatformSettings();
        if (platformSettings && platformSettings.latestSupportedJavaVersion) {
            const latestSupportedVersion = flattenMajorVersion(platformSettings.latestSupportedJavaVersion);
            const runtimeVersion = await checkJavaVersion(config.javaExec || path.join(await getJavaHome(), "bin", "java"));
            if (latestSupportedVersion < runtimeVersion) {
                showWarningMessageWithTroubleshooting({
                    message: "The compiled classes are not compatible with the runtime JDK. To mitigate the issue, please refer to \"Learn More\".",
                    anchor: UNSUPPORTED_CLASS_VERSION_ERROR,
                });
            }
        }
    } catch (err) {
        // do nothing
    }
}

export async function addMoreHelpfulVMArgs(config: vscode.DebugConfiguration) {
    try {
        const javaExec = config.javaExec || path.join(await getJavaHome(), "bin", "java");
        const version = await checkJavaVersion(javaExec);
        if (version >= 14) {
            // JEP-358: https://openjdk.java.net/jeps/358
            if (config.vmArgs && config.vmArgs.indexOf(HELPFUL_NPE_VMARGS) >= 0) {
                return;
            }

            config.vmArgs = (config.vmArgs || "") + " " + HELPFUL_NPE_VMARGS;
        }
    } catch (error) {
        // do nothing.
    }
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
    const regexp = /version "(.*)"/g;
    const match = regexp.exec(content);
    if (!match) {
        return 0;
    }

    return flattenMajorVersion(match[1]);
}

function flattenMajorVersion(version: string): number {
    // Ignore '1.' prefix for legacy Java versions
    if (version.startsWith("1.")) {
        version = version.substring(2);
    }

    // look into the interesting bits now
    const regexp = /\d+/g;
    const match = regexp.exec(version);
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
