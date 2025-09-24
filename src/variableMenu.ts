// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

export function registerVariableMenuCommands(context: vscode.ExtensionContext): void {
    vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("java.debug.settings") || event.affectsConfiguration("debug.autoExpandLazyVariables")) {
            updateContextKeys();
        }
    });
    // Initialize the context keys
    updateContextKeys();
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.showBin", () => updateVariableFormatter("formatType", "BIN")));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.showOct", () => updateVariableFormatter("formatType", "OCT")));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.showHex", () => updateVariableFormatter("formatType", "HEX")));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.showDec", () => updateVariableFormatter("formatType", "DEC")));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.showQualifiedNames", () => updateVariableFormatter("showQualifiedNames", true)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.notShowQualifiedNames", () => updateVariableFormatter("showQualifiedNames", false)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.showStaticVariables", () => updateVariableFormatter("showStaticVariables", true)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.notShowStaticVariables", () => updateVariableFormatter("showStaticVariables", false)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.showLogicalStructure", () => updateVariableFormatter("showLogicalStructure", true)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.notShowLogicalStructure", () => updateVariableFormatter("showLogicalStructure", false)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.showToString", () => updateVariableFormatter("showToString", true)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.notShowToString", () => updateVariableFormatter("showToString", false)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.autoExpandLazyVariables", () => toggleLazyVariableSetting(true)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(
        "java.debug.variables.manualExpandLazyVariables", () => toggleLazyVariableSetting(false)));
}

async function updateVariableFormatter(key: string, value: any) {
    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
    // Update the formatter to settings.json
    await debugSettingsRoot.update(key, value, getConfigurationTarget("java.debug", "settings"));
    refreshVariableView();
}

function refreshVariableView() {
    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
    if (vscode.debug.activeDebugSession && vscode.debug.activeDebugSession.type === "java") {
        const formatter: any = {
            formatType: debugSettingsRoot.formatType,
            showQualifiedNames: debugSettingsRoot.showQualifiedNames,
            showStaticVariables: debugSettingsRoot.showStaticVariables,
            showLogicalStructure: debugSettingsRoot.showLogicalStructure,
            showToString: debugSettingsRoot.showToString,
        };
        vscode.debug.activeDebugSession.customRequest("refreshVariables", formatter);
    }
}

async function toggleLazyVariableSetting(toggle: boolean) {
    const javadDebugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
    if (!javadDebugSettingsRoot.showToString) {
        await javadDebugSettingsRoot.update("showToString", true, getConfigurationTarget("java.debug", "settings"));
    }

    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("debug");
    await debugSettingsRoot.update("autoExpandLazyVariables", toggle, getConfigurationTarget("debug", "autoExpandLazyVariables"));
    refreshVariableView();
}

function getConfigurationTarget(section: string, key: string): vscode.ConfigurationTarget {
    const inspect = vscode.workspace.getConfiguration(section).inspect(key);
    if (inspect && inspect.workspaceFolderValue !== undefined) {
        return vscode.ConfigurationTarget.WorkspaceFolder;
    } else if (inspect && inspect.workspaceValue !== undefined) {
        return vscode.ConfigurationTarget.Workspace;
    } else {
        return vscode.ConfigurationTarget.Global;
    }
}

function updateContextKeys() {
    const debugSettingsRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("java.debug.settings");
    if (debugSettingsRoot) {
        vscode.commands.executeCommand("setContext", "javadebug:formatType", debugSettingsRoot.formatType);
        vscode.commands.executeCommand("setContext", "javadebug:showLogicalStructure", debugSettingsRoot.showLogicalStructure ? "on" : "off");
        vscode.commands.executeCommand("setContext", "javadebug:showQualifiedNames", debugSettingsRoot.showQualifiedNames ? "on" : "off");
        vscode.commands.executeCommand("setContext", "javadebug:showStaticVariables", debugSettingsRoot.showStaticVariables ? "on" : "off");
        vscode.commands.executeCommand("setContext", "javadebug:showToString", debugSettingsRoot.showToString ? "on" : "off");
    }

    const globalDebugRoot: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("debug");
    if (globalDebugRoot) {
        vscode.commands.executeCommand("setContext", "javadebug:expandLazyVariable", globalDebugRoot.autoExpandLazyVariables ? "on" : "off");
    }
}
