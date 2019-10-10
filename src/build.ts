// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as path from "path";
import * as vscode from "vscode";
import { sendError, setErrorCode, setUserError } from "vscode-extension-telemetry-wrapper";

import * as anchor from "./anchor";
import * as commands from "./commands";
import * as lsPlugin from "./languageServerPlugin";
import * as utility from "./utility";

export async function buildWorkspace(): Promise<boolean> {
    try {
        await commands.executeJavaExtensionCommand(commands.JAVA_BUILD_WORKSPACE, false);
    } catch (err) {
        return handleBuildFailure(err);
    }

    return true;
}

async function handleBuildFailure(err: any): Promise<boolean> {
    if (err instanceof utility.JavaExtensionNotActivatedError) {
        utility.guideToInstallJavaExtension();
        return false;
    }

    const error: Error = new utility.UserError({
        message: "Build failed",
    });
    setErrorCode(error, Number(err));
    sendError(error);

    if (err === lsPlugin.CompileWorkspaceStatus.WITHERROR || err === lsPlugin.CompileWorkspaceStatus.FAILED) {
        if (checkErrorsReportedByJavaExtension()) {
            vscode.commands.executeCommand("workbench.actions.view.problems");
        }

        const ans = await vscode.window.showErrorMessage("Build failed, do you want to continue?",
            "Proceed", "Fix...", "Cancel");
        if (ans === "Proceed") {
            return true;
        } else if (ans === "Fix...") {
            showFixSuggestions();
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

async function showFixSuggestions() {
    let buildFiles = [];
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
        label: "Troubleshooting guide",
        detail: "Find more detail about the troubleshooting steps",
    });

    const ans = await vscode.window.showQuickPick(pickitems, {
        placeHolder: "Please fix the errors in PROBLEMS first, then try the fix suggestions below.",
    });
    if (ans.label === "Clean workspace cache") {
        vscode.commands.executeCommand("java.clean.workspace");
    } else if (ans.label === "Update project configuration") {
        for (const buildFile of buildFiles) {
            await vscode.commands.executeCommand("java.projectConfiguration.update", vscode.Uri.parse(buildFile));
        }
    } else if (ans.label === "Troubleshooting guide") {
        utility.openTroubleshootingPage("Build failed", anchor.BUILD_FAILED);
    }
}
