// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import * as commands from "./commands";
import { JavaDebugConfigurationProvider } from "./configurationProvider";

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
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function fetchUsageData() {
    return commands.executeJavaLanguageServerCommand(commands.JAVA_FETCH_USAGE_DATA);
}
