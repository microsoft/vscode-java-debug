// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as path from "path";
import * as vscode from "vscode";
import { instrumentOperation, sendInfo, sendOperationError, setErrorCode } from "vscode-extension-telemetry-wrapper";

import * as anchor from "./anchor";
import * as commands from "./commands";
import * as lsPlugin from "./languageServerPlugin";
import { IProgressReporter } from "./progressAPI";
import * as utility from "./utility";

const JAVA_DEBUG_CONFIGURATION = "java.debug.settings";
const ON_BUILD_FAILURE_PROCEED = "onBuildFailureProceed";

enum CompileWorkspaceStatus {
    FAILED = 0,
    SUCCEED = 1,
    WITHERROR = 2,
    CANCELLED = 3,
}

export async function buildWorkspace(progressReporter: IProgressReporter): Promise<boolean> {
    const buildResult = await instrumentOperation("build", async (operationId: string) => {
        let error;
        try {
            await commands.executeJavaExtensionCommand(commands.JAVA_BUILD_WORKSPACE, false, progressReporter.getCancellationToken());
        } catch (err) {
            error = err;
        }

        return {
            error,
            operationId,
        };
    })();

    if (progressReporter.isCancelled() || buildResult.error === CompileWorkspaceStatus.CANCELLED) {
        return false;
    } else {
        return handleBuildFailure(buildResult.operationId, buildResult.error, progressReporter);
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
    if (!onBuildFailureProceed && err) {
        if (checkErrorsReportedByJavaExtension()) {
            vscode.commands.executeCommand("workbench.actions.view.problems");
        }

        progressReporter.hide(true);
        const ans = await vscode.window.showErrorMessage("Build failed, do you want to continue?", "Proceed", "Fix...", "Cancel");
        sendInfo(operationId, {
            operationName: "build",
            choiceForBuildError: ans || "esc",
        });
        if (ans === "Proceed") {
            return true;
        } else if (ans === "Fix...") {
            showFixSuggestions(operationId);
        }

        return false;
    }

    return true;
}

function checkErrorsReportedByJavaExtension(): boolean {
    const problems = vscode.languages.getDiagnostics() || [];
    for (const problem of problems) {
        const fileName = path.basename(problem[0].fsPath || "");
        if (fileName.endsWith(".java") || fileName === "pom.xml" || fileName.endsWith(".gradle")) {
            if (problem[1].filter((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error).length) {
                return true;
            }
        }
    }

    return false;
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
