// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";

export enum Type {
    EXCEPTION = "exception",
    USAGEDATA = "usageData",
    USAGEERROR = "usageError",
    ACTIVATEEXTENSION = "activateExtension", // TODO: Activation belongs to usage data, remove this category.
}

class Logger implements vscode.Disposable {
    private reporter: TelemetryReporter = null;

    public initialize(context: vscode.ExtensionContext, firstParty?: boolean): void {
        if (this.reporter) {
            return;
        }

        const extensionPackage = JSON.parse(fs.readFileSync(context.asAbsolutePath("./package.json"), "utf-8"));
        if (extensionPackage) {
            const packageInfo = {
                name: extensionPackage.name,
                version: extensionPackage.version,
                aiKey: extensionPackage.aiKey,
            };
            if (packageInfo.aiKey) {
                this.reporter = new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey, firstParty);
            }
        }
    }

    public log(type: Type, properties?: { [key: string]: string; }, measures?: { [key: string]: number; }): void {
        if (!this.reporter) {
            return;
        }

        if (type === Type.EXCEPTION || type === Type.USAGEERROR) {
            this.reporter.sendTelemetryErrorEvent(type, properties, measures);
        } else {
            this.reporter.sendTelemetryEvent(type, properties, measures);
        }
    }

    public logMessage(type: Type, message: string): void {
        this.log(type, { message });
    }

    public dispose() {
        if (this.reporter) {
            this.reporter.dispose();
        }
    }
}

export const logger = new Logger();
