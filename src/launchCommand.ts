// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as cp from "child_process";
import * as vscode from "vscode";

import { inferLaunchCommandLength } from "./languageServerPlugin";
import { getJavaHome } from "./utility";

enum shortenApproach {
    none = "none",
    jarmanifest = "jarmanifest",
    argfile = "argfile",
}

export async function populateShortenCommandLineField(config: vscode.DebugConfiguration): Promise<vscode.DebugConfiguration> {
    if (config.request === "launch" && (!config.shortenCommandLine || config.shortenCommandLine === "auto")) {
        config.shortenCommandLine = await detectLaunchCommandStyle(config);
    }

    return config;
}

export async function detectLaunchCommandStyle(config: vscode.DebugConfiguration): Promise<shortenApproach> {
    const cliLength = await inferLaunchCommandLength(config);
    const javaHome = await getJavaHome();
    const javaVersion = await checkJavaVersion(javaHome);
    const recommendedApproach = javaVersion <= 8 ? shortenApproach.jarmanifest : shortenApproach.argfile;
    if (config.console === "internalConsole") {
        // In windows, the max process commmand line length is 32k (32678) characters.
        // TODO Differentiate the limit for other platforms OSX and linux.
        return cliLength < 32678 ? shortenApproach.none : recommendedApproach;
    } else {
        // In windows, the max command line length for cmd terminal is 8191 characters.
        // TODO Differentiate the limit for other platforms OSX and linux.
        return cliLength < 8191 ? shortenApproach.none : recommendedApproach;
    }
}

function checkJavaVersion(javaHome: string): Promise<number> {
    return new Promise((resolve, reject) => {
        cp.execFile(javaHome + "/bin/java", ["-version"], {}, (error, stdout, stderr) => {
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
