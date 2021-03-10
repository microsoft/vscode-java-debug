// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { addContextProperty, sendInfo } from "vscode-extension-telemetry-wrapper";
import { getExperimentationService, IExperimentationService, IExperimentationTelemetry, TargetPopulation } from "vscode-tas-client";

class ExperimentationTelemetry implements IExperimentationTelemetry {

    public setSharedProperty(name: string, value: string): void {
        addContextProperty(name, value);
    }

    public postEvent(eventName: string, props: Map<string, string>): void {
        const payload: any = { __event_name__: eventName };
        for (const [key, value] of props) {
            payload[key] = value;
        }

        sendInfo("", payload);
    }
}

let expService: IExperimentationService;

export function getExpService() {
    return expService;
}

export function initExpService(context: vscode.ExtensionContext): void {
    const packageJson: {[key: string]: any} = require("../package.json");
    // tslint:disable: no-string-literal
    const extensionName = `${packageJson["publisher"]}.${packageJson["name"]}`;
    const extensionVersion = packageJson["version"];
    // tslint:enable: no-string-literal
    expService = getExperimentationService(extensionName, extensionVersion,
        TargetPopulation.Public, new ExperimentationTelemetry(), context.globalState);
}
