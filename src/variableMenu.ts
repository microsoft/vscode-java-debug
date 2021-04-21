// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

export function registerVariableMenuCommands(context: vscode.ExtensionContext): void {
    vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("java.debug.settings")) {
            updateContextKeys();
        }
    });
    // Initialize the context keys
    updateContextKeys();

    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.showHex", () => turnOnFormat("showHex")));
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.notShowHex", () => turnOffFormat("showHex")));
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.showQualifiedNames", () => turnOnFormat("showQualifiedNames")));
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.notShowQualifiedNames", () => turnOffFormat("showQualifiedNames")));
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.showStaticVariables", () => turnOnFormat("showStaticVariables")));
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.notShowStaticVariables", () => turnOffFormat("showStaticVariables")));
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.showLogicalStructure", () => turnOnFormat("showLogicalStructure")));
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.notShowLogicalStructure", () => turnOffFormat("showLogicalStructure")));
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.showToString", () => turnOnFormat("showToString")));
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("java.debug.variables.notShowToString", () => turnOffFormat("showToString")));
}

function turnOnFormat(key: string) {
    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
    if (vscode.debug.activeDebugSession && vscode.debug.activeDebugSession.type === "java") {
        const formatter: any = {
            showHex: debugSettingsRoot.showHex,
            showQualifiedNames: debugSettingsRoot.showQualifiedNames,
            showStaticVariables: debugSettingsRoot.showStaticVariables,
            showLogicalStructure: debugSettingsRoot.showLogicalStructure,
            showToString: debugSettingsRoot.showToString,
        };
        formatter[key] = true;
        vscode.debug.activeDebugSession.customRequest("refreshVariables", formatter);
    }

    // Update the formatter to settings.json
    const inspect = vscode.workspace.getConfiguration("java.debug").inspect("settings");
    let configurationTarget = vscode.ConfigurationTarget.Global;
    if (inspect && inspect.workspaceFolderValue !== undefined) {
        configurationTarget = vscode.ConfigurationTarget.WorkspaceFolder;
    } else if (inspect && inspect.workspaceValue !== undefined) {
        configurationTarget = vscode.ConfigurationTarget.Workspace;
    }
    debugSettingsRoot.update(key, true, configurationTarget);
}

function turnOffFormat(key: string) {
    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
    if (vscode.debug.activeDebugSession && vscode.debug.activeDebugSession.type === "java") {
        const formatter: any = {
            showHex: debugSettingsRoot.showHex,
            showQualifiedNames: debugSettingsRoot.showQualifiedNames,
            showStaticVariables: debugSettingsRoot.showStaticVariables,
            showLogicalStructure: debugSettingsRoot.showLogicalStructure,
            showToString: debugSettingsRoot.showToString,
        };
        formatter[key] = false;
        vscode.debug.activeDebugSession.customRequest("refreshVariables", formatter);
    }

    // Update the formatter to settings.json
    const inspect = vscode.workspace.getConfiguration("java.debug").inspect("settings");
    let configurationTarget = vscode.ConfigurationTarget.Global;
    if (inspect && inspect.workspaceFolderValue !== undefined) {
        configurationTarget = vscode.ConfigurationTarget.WorkspaceFolder;
    } else if (inspect && inspect.workspaceValue !== undefined) {
        configurationTarget = vscode.ConfigurationTarget.Workspace;
    }
    debugSettingsRoot.update(key, false, configurationTarget);
}

function updateContextKeys() {
    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
    if (debugSettingsRoot) {
        vscode.commands.executeCommand("setContext", "java.debug.showHex", debugSettingsRoot.showHex ? "on" : "off");
        vscode.commands.executeCommand("setContext", "java.debug.showLogicalStructure", debugSettingsRoot.showLogicalStructure ? "on" : "off");
        vscode.commands.executeCommand("setContext", "java.debug.showQualifiedNames", debugSettingsRoot.showQualifiedNames ? "on" : "off");
        vscode.commands.executeCommand("setContext", "java.debug.showStaticVariables", debugSettingsRoot.showStaticVariables ? "on" : "off");
        vscode.commands.executeCommand("setContext", "java.debug.showToString", debugSettingsRoot.showToString ? "on" : "off");
        return;
    }
}
