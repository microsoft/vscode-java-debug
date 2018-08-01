// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";

export enum Type {
    EXCEPTION = "exception",
    USAGEDATA = "usageData",
    USAGEERROR = "usageError",
    ACTIVATEEXTENSION = "activateExtension", // TODO: Activation belongs to usage data, remove this category.
}

class Logger {
    private reporter: TelemetryReporter = null;

    public initialize(context: vscode.ExtensionContext): void {
        if (this.reporter) {
            return;
        }

        const extensionPackage = require(context.asAbsolutePath("./package.json"));
        if (extensionPackage) {
            const packageInfo = {
                name: extensionPackage.name,
                version: extensionPackage.version,
                aiKey: extensionPackage.aiKey,
            };
            if (packageInfo.aiKey) {
                this.reporter = new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
            }
        }
    }

    public log(type: Type, properties?: { [key: string]: string; }, measures?: { [key: string]: number; }): void {
        if (!this.reporter) {
            return;
        }

        this.reporter.sendTelemetryEvent(type, properties, measures);
    }

    public logMessage(type: Type, message: string): void {
        this.log(type, { message });
    }
}

export const logger = new Logger();
