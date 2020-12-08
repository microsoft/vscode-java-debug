// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import * as path from "path";
import * as vscode from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation,
    instrumentOperationAsVsCodeCommand, setUserError } from "vscode-extension-telemetry-wrapper";
import * as commands from "./commands";
import { JavaDebugConfigurationProvider } from "./configurationProvider";
import { HCR_EVENT, JAVA_LANGID, USER_NOTIFICATION_EVENT } from "./constants";
import { NotificationBar } from "./customWidget";
import { initializeCodeLensProvider, startDebugging } from "./debugCodeLensProvider";
import { handleHotCodeReplaceCustomEvent, initializeHotCodeReplace, NO_BUTTON, YES_BUTTON } from "./hotCodeReplace";
import { JavaDebugAdapterDescriptorFactory } from "./javaDebugAdapterDescriptorFactory";
import { logJavaException, logJavaInfo } from "./javaLogger";
import { IMainClassOption, IMainMethod, resolveMainMethod } from "./languageServerPlugin";
import { logger, Type } from "./logger";
import { mainClassPicker  } from "./mainClassPicker";
import { pickJavaProcess } from "./processPicker";
import { JavaTerminalLinkProvder } from "./terminalLinkProvider";
import { initializeThreadOperations } from "./threadOperations";
import * as utility from "./utility";

export async function activate(context: vscode.ExtensionContext) {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), {
        firstParty: true,
    });
    await instrumentOperation("activation", initializeExtension)(context);
}

function initializeExtension(_operationId: string, context: vscode.ExtensionContext) {
    // Deprecated
    logger.initialize(context, true);

    registerDebugEventListener(context);
    context.subscriptions.push(logger);
    context.subscriptions.push(vscode.window.registerTerminalLinkProvider(new JavaTerminalLinkProvder()));
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
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("java.debug.runFromProjectView", async (node: any) => {
        await runJavaProject(node, true);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("java.debug.debugFromProjectView", async (node: any) => {
        await runJavaProject(node, false);
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
                    if (entry.scope === "exception") {
                        logJavaException(commonProperties);
                    } else {
                        logJavaInfo(commonProperties, measureProperties);
                    }

                    // Deprecated
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

function handleUserNotification(customEvent: vscode.DebugSessionCustomEvent) {
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
    const start = new Date().getTime();
    const response = await debugSession.customRequest("redefineClasses");
    const elapsed = new Date().getTime() - start;
    const humanVisibleDelay = elapsed < 150 ? 150 : 0;
    if (humanVisibleDelay) {
        await new Promise((resolve) => {
            setTimeout(resolve, humanVisibleDelay);
        });
    }

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
    hcrStatusBar.show("$(check)" + `${changed} changed class${changed > 1 ? "es are" : " is"} reloaded`, 5 * 1000);
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

    const hasMainMethods: boolean = mainMethods.length > 0;
    const canRunTests: boolean = await canDelegateToJavaTestRunner(uri);
    const defaultPlaceHolder: string = "Select the main class to run";

    if (!hasMainMethods && !canRunTests) {
        const mainClasses: IMainClassOption[] = await utility.searchMainMethods();
        const placeHolder: string = `The file '${path.basename(uri.fsPath)}' is not executable, please select a main class you want to run.`;
        await launchMain(mainClasses, uri, noDebug, placeHolder, false /*autoPick*/);
    } else if (hasMainMethods && !canRunTests) {
        await launchMain(mainMethods, uri, noDebug, defaultPlaceHolder);
    } else if (!hasMainMethods && canRunTests) {
        await launchTesting(uri, noDebug);
    } else {
        const launchMainChoice: string = "main() method";
        const launchTestChoice: string = "unit tests";
        const choice: string = await vscode.window.showQuickPick(
            [launchMainChoice, launchTestChoice],
            { placeHolder: "Please select which kind of task you would like to launch" },
        );
        if (choice === launchMainChoice) {
            await launchMain(mainMethods, uri, noDebug, defaultPlaceHolder);
        } else if (choice === launchTestChoice) {
            await launchTesting(uri, noDebug);
        }
    }
}

async function canDelegateToJavaTestRunner(uri: vscode.Uri): Promise<boolean> {
    const fsPath: string = uri.fsPath;
    const isTestFile: boolean = /.*[\/\\]src[\/\\]test[\/\\]java[\/\\].*[Tt]ests?\.java/.test(fsPath);
    if (!isTestFile) {
        return false;
    }
    return (await vscode.commands.getCommands()).includes("java.test.editor.run");
}

async function launchTesting(uri: vscode.Uri, noDebug: boolean): Promise<void> {
    noDebug ? vscode.commands.executeCommand("java.test.editor.run", uri) : vscode.commands.executeCommand("java.test.editor.debug", uri);
}

async function launchMain(mainMethods: IMainClassOption[], uri: vscode.Uri, noDebug: boolean, placeHolder: string,
                          autoPick: boolean = true): Promise<void> {
    if (!mainMethods || !mainMethods.length) {
        vscode.window.showErrorMessage(
            "Error: Main method not found in the file, please define the main method as: public static void main(String[] args)");
        return;
    }

    const pick = await mainClassPicker.showQuickPickWithRecentlyUsed(mainMethods, placeHolder, autoPick);
    if (!pick) {
        return;
    }

    await startDebugging(pick.mainClass, pick.projectName, uri, noDebug);
}

async function runJavaProject(node: any, noDebug: boolean) {
    if (!node || !node.name || !node.uri) {
        vscode.window.showErrorMessage(`Failed to ${noDebug ? "run" : "debug"} the project because of invalid project node. `
            + "This command only applies to Project Explorer view.");
        const error = new Error(`Failed to ${noDebug ? "run" : "debug"} the project because of invalid project node.`);
        setUserError(error);
        throw error;
    }

    const mainClassesOptions: IMainClassOption[] = await utility.searchMainMethods(vscode.Uri.parse(node.uri));
    if (!mainClassesOptions || !mainClassesOptions.length) {
        vscode.window.showErrorMessage(`Failed to ${noDebug ? "run" : "debug"} this project '${node._nodeData.displayName || node.name}' `
            + "because it does not contain any main class.");
        return;
    }

    const pick = await mainClassPicker.showQuickPickWithRecentlyUsed(mainClassesOptions,
        "Select the main class to run.");
    if (!pick) {
        return;
    }

    const projectName: string = pick.projectName;
    const mainClass: string = pick.mainClass;
    const filePath: string = pick.filePath;
    const workspaceFolder: vscode.WorkspaceFolder = filePath ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath)) : undefined;
    const launchConfigurations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("launch", workspaceFolder);
    const existingConfigs: vscode.DebugConfiguration[] = launchConfigurations.configurations;
    const existConfig: vscode.DebugConfiguration = _.find(existingConfigs, (config) => {
        return config.mainClass === mainClass && _.toString(config.projectName) === _.toString(projectName);
    });
    const debugConfig = existConfig || {
        type: "java",
        name: `Launch - ${mainClass.substr(mainClass.lastIndexOf(".") + 1)}`,
        request: "launch",
        mainClass,
        projectName,
    };
    debugConfig.noDebug = noDebug;
    vscode.debug.startDebugging(workspaceFolder, debugConfig);
}
