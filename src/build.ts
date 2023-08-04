// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as vscode from "vscode";
import { instrumentOperation, sendInfo, sendOperationError, setErrorCode } from "vscode-extension-telemetry-wrapper";

import * as anchor from "./anchor";
import * as commands from "./commands";
import * as lsPlugin from "./languageServerPlugin";
import { IProgressReporter } from "./progressAPI";
import * as utility from "./utility";

const JAVA_DEBUG_CONFIGURATION = "java.debug.settings";
const ON_BUILD_FAILURE_PROCEED = "onBuildFailureProceed";
const CANCELLED_CODE = -32800;

enum CompileWorkspaceStatus {
    FAILED = 0,
    SUCCEED = 1,
    WITHERROR = 2,
    CANCELLED = 3,
    GRADLE_BS_COMPILATION_ERROR = 100,
}

export interface BuildParams {
    readonly mainClass: string;
    readonly projectName?: string;
    readonly filePath?: string;
    readonly isFullBuild: boolean;
}

export async function buildWorkspace(params: BuildParams, progressReporter: IProgressReporter): Promise<boolean> {
    const startAt = new Date().getTime();
    const buildResult = await instrumentOperation("build", async (operationId: string) => {
        let status;
        try {
            status = await commands.executeJavaLanguageServerCommand(commands.JAVA_BUILD_WORKSPACE,
                JSON.stringify(params),
                progressReporter.getCancellationToken());
        } catch (err) {
            status = (err && err.code === CANCELLED_CODE) ? CompileWorkspaceStatus.CANCELLED : err;
        }

        return {
            status,
            operationId,
        };
    })();

    if (progressReporter.isCancelled() || buildResult.status === CompileWorkspaceStatus.CANCELLED) {
        return false;
    } else if (buildResult.status === CompileWorkspaceStatus.SUCCEED) {
        return true;
    } else {
        const elapsed = new Date().getTime() - startAt;
        const humanVisibleDelay = elapsed < 150 ? 150 : 0;
        await new Promise(resolve => {
            setTimeout(() => { // set a timeout so user still can see a compiling message.
                resolve(null);
            }, humanVisibleDelay);
        });
        return handleBuildFailure(buildResult.operationId, buildResult.status, progressReporter);
    }
}

async function handleBuildFailure(operationId: string, err: any, progressReporter: IProgressReporter): Promise<boolean> {
    const configuration = vscode.workspace.getConfiguration(JAVA_DEBUG_CONFIGURATION);
    const onBuildFailureProceed = configuration.get<boolean>(ON_BUILD_FAILURE_PROCEED);

    if (err instanceof utility.JavaExtensionNotEnabledError) {
        utility.guideToInstallJavaExtension();
        return false;
    }

    const error: Error = new utility.UserError({
        message: "Build failed",
    });
    setErrorCode(error, Number(err));
    sendOperationError(operationId, "build", error);
    const errorDiagnostics = traceErrorTypes(operationId);
    if (!onBuildFailureProceed && err) {
        // build failure information is not displayed in PROBLEMS panel for build server project.
        if (errorDiagnostics && err !== CompileWorkspaceStatus.GRADLE_BS_COMPILATION_ERROR) {
            vscode.commands.executeCommand("workbench.actions.view.problems");
        }

        progressReporter.hide(true);
        const ans = await vscode.window.showErrorMessage("Build failed, do you want to continue?", "Continue", "Always Continue", "Fix...");
        sendInfo(operationId, {
            operationName: "build",
            choiceForBuildError: ans || "esc",
        });
        if (ans === "Continue") {
            return true;
        } else if (ans === "Always Continue") {
            const debugSettings: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
            debugSettings?.update("onBuildFailureProceed", true);
            return true;
        } else if (ans === "Fix...") {
            showFixSuggestions(operationId);
        }

        return false;
    }

    return true;
}

function traceErrorTypes(operationId: string): boolean {
    const problems = vscode.languages.getDiagnostics() || [];
    const errorTypes: {[key: string]: number} = {};
    let errorCount = 0;
    for (const problem of problems) {
        for (const diagnostic of problem[1]) {
            if (diagnostic.severity === vscode.DiagnosticSeverity.Error && diagnostic.source === "Java") {
                const errorCode = typeof diagnostic.code === 'object' ? String(diagnostic.code.value) : String(diagnostic.code);
                errorTypes[errorCode] = (errorTypes[errorCode] || 0) + 1;
                errorCount++;
            }
        }
    }

    if (errorCount) {
        sendInfo(operationId, {
            buildErrorTypes: JSON.stringify(errorTypes),
            buildErrorCount: errorCount,
        });
    }

    return errorCount > 0;
}

async function showFixSuggestions(operationId: string) {
    let buildFiles: string[] = [];
    try {
        buildFiles = await lsPlugin.resolveBuildFiles();
    } catch (error) {
        // do nothing
    }

    const pickitems = [];
    pickitems.push({
        label: "Clean workspace cache",
        detail: "Clean the stale workspace and reload the window",
    });
    if (buildFiles.length) {
        pickitems.push({
            label: "Update project configuration",
            detail: "Force the language server to update the project configuration/classpath",
        });
    }
    pickitems.push({
        label: "Open log file",
        detail: "Open log file to view more details for the build errors",
    });
    pickitems.push({
        label: "Troubleshooting guide",
        detail: "Find more detail about the troubleshooting steps",
    });

    const ans = await vscode.window.showQuickPick(pickitems, {
        placeHolder: "Please fix the errors in PROBLEMS first, then try the fix suggestions below.",
    });
    sendInfo(operationId, {
        operationName: "build",
        choiceForBuildFix: ans ? ans.label : "esc",
    });
    if (!ans) {
        return;
    }

    if (ans.label === "Clean workspace cache") {
        vscode.commands.executeCommand("java.clean.workspace");
    } else if (ans.label === "Update project configuration") {
        for (const buildFile of buildFiles) {
            await vscode.commands.executeCommand("java.projectConfiguration.update", vscode.Uri.parse(buildFile));
        }
    } else if (ans.label === "Open log file") {
        vscode.commands.executeCommand("java.open.serverLog");
    } else if (ans.label === "Troubleshooting guide") {
        utility.openTroubleshootingPage("Build failed", anchor.BUILD_FAILED);
    }
}
