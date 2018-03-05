// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import * as commands from "./commands";
import { JavaDebugConfigurationProvider } from "./configurationProvider";
import { initializeHotCodeReplace } from "./hotCodeReplace";

export function activate(context: vscode.ExtensionContext) {
    // The reporter will be initialized by the later telemetry handler.
    let reporter: TelemetryReporter = null;

    // Telemetry.
    const extensionPackage = require(context.asAbsolutePath("./package.json"));
    if (extensionPackage) {
        const packageInfo = {
            name: extensionPackage.name,
            version: extensionPackage.version,
            aiKey: extensionPackage.aiKey,
        };
        if (packageInfo.aiKey) {
            reporter = new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
            reporter.sendTelemetryEvent("activateExtension", {});
            const measureKeys = ["duration"];
            vscode.debug.onDidTerminateDebugSession(() => {
                fetchUsageData().then((ret) => {
                    if (Array.isArray(ret) && ret.length) {
                        ret.forEach((entry) => {
                            const commonProperties: any = {};
                            const measureProperties: any = {};
                            for (const key of Object.keys(entry)) {
                                if (measureKeys.indexOf(key) >= 0) {
                                    measureProperties[key] = entry[key];
                                } else {
                                    commonProperties[key] = String(entry[key]);
                                }
                            }
                            reporter.sendTelemetryEvent(entry.scope === "exception" ? "exception" : "usageData", commonProperties, measureProperties);
                        });
                    }
                });
            });
        }
    }
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("java", new JavaDebugConfigurationProvider(reporter)));
    context.subscriptions.push(vscode.commands.registerCommand("JavaDebug.SpecifyProgramArgs", async () => {
        return specifyProgramArguments(context);
    }));
    initializeHotCodeReplace(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function fetchUsageData() {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_FETCH_USAGE_DATA);
}

function specifyProgramArguments(context: vscode.ExtensionContext): Thenable<string> {
    const javaDebugProgramArgsKey = "JavaDebugProgramArgs";

    const options: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        placeHolder: "Enter program arguments or leave empty to pass no args",
    };

    const prevArgs = context.workspaceState.get(javaDebugProgramArgsKey, "");
    if (prevArgs.length > 0) {
        options.value = prevArgs;
    }

    return vscode.window.showInputBox(options).then((text) => {
        // When user cancels the input box (by pressing Esc), the text value is undefined.
        if (text !== undefined) {
            context.workspaceState.update(javaDebugProgramArgsKey, text);
        }

        return text;
    });
}
