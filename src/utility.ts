import * as vscode from "vscode";
import * as opn from "opn";

const TROUBLESHOOTING_LINK = "https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md";

export async function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    const choice = await vscode.window.showWarningMessage(message, ...items, "Learn More");
    if (choice === "Learn More") {
        opn(TROUBLESHOOTING_LINK);
        return;
    }
    return choice;
}

export async function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
    const choice = await vscode.window.showErrorMessage(message, "Learn More");
    if (choice === "Learn More") {
        opn(TROUBLESHOOTING_LINK);
        return;
    }
    return choice;
}
