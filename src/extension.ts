// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import * as path from "path";
import * as vscode from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation,
    instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import * as commands from "./commands";
import { JavaDebugConfigurationProvider } from "./configurationProvider";
import { HCR_EVENT, JAVA_LANGID, USER_NOTIFICATION_EVENT } from "./constants";
import { NotificationBar } from "./customWidget";
import { initializeCodeLensProvider, startDebugging } from "./debugCodeLensProvider";
import { handleHotCodeReplaceCustomEvent, initializeHotCodeReplace, NO_BUTTON, YES_BUTTON } from "./hotCodeReplace";
import { JavaDebugAdapterDescriptorFactory } from "./javaDebugAdapterDescriptorFactory";
import { IMainMethod, resolveMainMethod } from "./languageServerPlugin";
import { logger, Type } from "./logger";
import { pickJavaProcess } from "./processPicker";
import { initializeThreadOperations } from "./threadOperations";
import * as utility from "./utility";

export async function activate(context: vscode.ExtensionContext) {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), {
        firstParty: true,
    });
    await instrumentOperation("activation", initializeExtension)(context);
}

function initializeExtension(operationId: string, context: vscode.ExtensionContext) {
    logger.initialize(context, true);
    logger.log(Type.ACTIVATEEXTENSION, {}); // TODO: Activation belongs to usage data, remove this line.
    logger.log(Type.USAGEDATA, {
        description: "activateExtension",
    });

    registerDebugEventListener(context);
    context.subscriptions.push(logger);
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("java", new JavaDebugConfigurationProvider()));
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("java", new JavaDebugAdapterDescriptorFactory()));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("JavaDebug.SpecifyProgramArgs", async () => {
        return specifyProgramArguments(context);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("JavaDebug.PickJavaProcess", async () => {
        let javaProcess;
        try {
            javaProcess = await pickJavaProcess();
        } catch (error) {
            vscode.window.showErrorMessage(error.message ? error.message : String(error));
        }

        // tslint:disable-next-line
        return javaProcess ? String(javaProcess.pid) : "${command:PickJavaProcess}";
    }));
    const hcrStatusBar: NotificationBar = new NotificationBar();
    context.subscriptions.push(hcrStatusBar);
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("java.debug.hotCodeReplace", async () => {
        await applyHCR(hcrStatusBar);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("java.debug.runJavaFile", async (uri: vscode.Uri) => {
        await runJavaFile(uri, true);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("java.debug.debugJavaFile", async (uri: vscode.Uri) => {
        await runJavaFile(uri, false);
    }));
    initializeHotCodeReplace(context);
    initializeCodeLensProvider(context);
    initializeThreadOperations(context);
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}

function registerDebugEventListener(context: vscode.ExtensionContext) {
    const measureKeys = ["duration"];
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession((e) => {
        if (e.type !== "java") {
            return;
        }
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
    }));

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

async function applyHCR(hcrStatusBar: NotificationBar) {
    const debugSession: vscode.DebugSession = vscode.debug.activeDebugSession;
    if (!debugSession) {
        return;
    }

    if (debugSession.configuration.noDebug) {
        vscode.window.showWarningMessage("Failed to apply the changes because hot code replace is not supported by run mode, "
            + "would you like to restart the program?", YES_BUTTON, NO_BUTTON).then((res) => {
            if (res === YES_BUTTON) {
                vscode.commands.executeCommand("workbench.action.debug.restart");
            }
        });

        return;
    }

    const autobuildConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.autobuild");
    if (!autobuildConfig.enabled) {
        const ans = await vscode.window.showWarningMessage(
            "The hot code replace feature requires you to enable the autobuild flag, do you want to enable it?",
            "Yes", "No");
        if (ans === "Yes") {
            await autobuildConfig.update("enabled", true);
            // Force an incremental build to avoid auto build is not finishing during HCR.
            try {
                await commands.executeJavaExtensionCommand(commands.JAVA_BUILD_WORKSPACE, false);
            } catch (err) {
                // do nothing.
            }
        }
    }

    hcrStatusBar.show("$(sync~spin)Applying code changes...");
    const response = await debugSession.customRequest("redefineClasses");
    if (response && response.errorMessage) {
        // The detailed error message is handled by hotCodeReplace#handleHotCodeReplaceCustomEvent
        hcrStatusBar.clear();
        return;
    }

    if (!response || !response.changedClasses || !response.changedClasses.length) {
        hcrStatusBar.clear();
        vscode.window.showWarningMessage("Cannot find any changed classes for hot replace!");
        return;
    }

    const changed = response.changedClasses.length;
    hcrStatusBar.show("$(check)" + `${changed} changed class${changed > 1 ? "es are" : " is"} reloaded!`, 5 * 1000);
}

async function runJavaFile(uri: vscode.Uri, noDebug: boolean) {
    const alreadyActivated: boolean = utility.isJavaExtActivated();
    try {
        // Wait for Java Language Support extension being on Standard mode.
        const isOnStandardMode = await utility.waitForStandardMode();
        if (!isOnStandardMode) {
            return;
        }
    } catch (ex) {
        if (ex instanceof utility.JavaExtensionNotEnabledError) {
            utility.guideToInstallJavaExtension();
            return;
        }

        if (alreadyActivated) {
            vscode.window.showErrorMessage(String((ex && ex.message) || ex));
            return;
        }

        throw ex;
    }

    const activeEditor: vscode.TextEditor = vscode.window.activeTextEditor;
    if (!uri && activeEditor && _.endsWith(path.basename(activeEditor.document.fileName), ".java")) {
        uri = activeEditor.document.uri;
    }

    if (!uri) {
        vscode.window.showErrorMessage(`${noDebug ? "Run" : "Debug"} failed. Please open a Java file with main method first.`);
        return;
    }

    let mainMethods: IMainMethod[] = [];
    try {
        mainMethods = await resolveMainMethod(uri);
    } catch (ex) {
        vscode.window.showErrorMessage(String((ex && ex.message) || ex));
        throw ex;
    }

    if (!mainMethods || !mainMethods.length) {
        vscode.window.showErrorMessage(
            "Error: Main method not found in the file, please define the main method as: public static void main(String[] args)");
        return;
    }

    const projectName = mainMethods[0].projectName;
    let mainClass = mainMethods[0].mainClass;
    if (mainMethods.length > 1) {
        mainClass = await vscode.window.showQuickPick(mainMethods.map((mainMethod) => mainMethod.mainClass), {
            placeHolder: "Select the main class to launch.",
        });
    }

    if (!mainClass) {
        return;
    }

    await startDebugging(mainClass, projectName, uri, noDebug);
}
