// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation } from "vscode-extension-telemetry-wrapper";
import * as commands from "./commands";
import { JavaDebugConfigurationProvider } from "./configurationProvider";
import { HCR_EVENT, JAVA_LANGID, USER_NOTIFICATION_EVENT } from "./constants";
import { initializeCodeLensProvider } from "./debugCodeLensProvider"
import { handleHotCodeReplaceCustomEvent, initializeHotCodeReplace } from "./hotCodeReplace";
import { logger, Type } from "./logger";
import * as utility from "./utility";

export async function activate(context: vscode.ExtensionContext) {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"));
    await instrumentOperation("activation", initializeExtension)(context);
}

function initializeExtension(operationId: string, context: vscode.ExtensionContext) {
    logger.initialize(context);
    logger.log(Type.ACTIVATEEXTENSION, {}); // TODO: Activation belongs to usage data, remove this line.
    logger.log(Type.USAGEDATA, {
        description: "activateExtension",
    });

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
                    logger.log(entry.scope === "exception" ? Type.EXCEPTION : Type.USAGEDATA, commonProperties, measureProperties);
                });
            }
        });
    });

    context.subscriptions.push(logger);
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("java", new JavaDebugConfigurationProvider()));
    context.subscriptions.push(instrumentAndRegisterCommand("JavaDebug.SpecifyProgramArgs", async () => {
        return specifyProgramArguments(context);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("java.debug.hotCodeReplace", async (args: any) => {
        const autobuildConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.autobuild");
        if (!autobuildConfig.enabled) {
            const ans = await vscode.window.showWarningMessage(
                "The hot code replace feature requires you to enable the autobuild flag, do you want to enable it?",
                "Yes", "No");
            if (ans === "Yes") {
                await autobuildConfig.update("enabled", true);
            } else {
                return;
            }
        }

        const debugSession: vscode.DebugSession = vscode.debug.activeDebugSession;
        if (!debugSession) {
            return;
        }

        return vscode.window.withProgress({ location: vscode.ProgressLocation.Window }, async (progress) => {
            progress.report({ message: "Applying code changes..." });
            return await debugSession.customRequest("redefineClasses");
        });
    }));
    initializeHotCodeReplace(context);
    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent((customEvent) => {
        const t = customEvent.session ? customEvent.session.type : undefined;
        if (t !== JAVA_LANGID) {
            return;
        }
        if (customEvent.event === HCR_EVENT) {
            handleHotCodeReplaceCustomEvent(customEvent);
        } else if (customEvent.event === USER_NOTIFICATION_EVENT) {
            handleUserNotification(customEvent);
        }
    }));

    initializeCodeLensProvider(context);
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}

function handleUserNotification(customEvent) {
    if (customEvent.body.notificationType === "ERROR") {
        utility.showErrorMessageWithTroubleshooting({
            message: customEvent.body.message,
        });
    } else if (customEvent.body.notificationType === "WARNING") {
        utility.showWarningMessageWithTroubleshooting({
            message: customEvent.body.message,
        });
    } else {
        vscode.window.showInformationMessage(customEvent.body.message);
    }
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

        return text || " ";
    });
}

function instrumentAndRegisterCommand(name: string, cb: (...args: any[]) => any) {
    const instrumented = instrumentOperation(name, async (_operationId, myargs) => await cb(myargs));
    return vscode.commands.registerCommand(name, instrumented);
}
