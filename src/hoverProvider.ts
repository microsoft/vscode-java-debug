// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken, Command, Disposable, Hover, HoverProvider, languages, MarkdownString, Position, ProviderResult, TextDocument,
    Uri, window } from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { JAVA_LANGID } from "./constants";
import { startDebugging } from "./debugCodeLensProvider";
import { resolveElementAtSelection } from "./languageServerPlugin";

const JAVA_HOVER_RUN_COMMAND = "java.debug.runHover";
const MAIN_METHOD_REGEX = /^(public|static|final|synchronized|\s+){4,}void\s+main\s*\(\s*String\s*\[\s*\]\s*\w+\s*\)\s*($|\{)/;

export function initializeHoverProvider(): Disposable {
    return new DebugHoverProvider();
}

class DebugHoverProvider implements Disposable {
    private runHoverCommand: Disposable;
    private hoverProvider: Disposable | undefined;

    constructor() {
        this.runHoverCommand = instrumentOperationAsVsCodeCommand(JAVA_HOVER_RUN_COMMAND, async (noDebug: boolean, uri: string, position: any) => {
            const element = await resolveElementAtSelection(uri, position.line, position.character);
            if (element && element.hasMainMethod) {
                startDebugging(element.declaringType, element.projectName, Uri.parse(uri), noDebug);
            } else {
                window.showErrorMessage("The hovered element is not a main method.");
            }
        });
        this.hoverProvider = languages.registerHoverProvider(JAVA_LANGID, new InternalDebugHoverProvider());
    }

    public dispose() {
        if (this.runHoverCommand) {
            this.runHoverCommand.dispose();
        }

        if (this.hoverProvider) {
            this.hoverProvider.dispose();
        }
    }
}

class InternalDebugHoverProvider implements HoverProvider {
    public provideHover(document: TextDocument, position: Position, _token: CancellationToken): ProviderResult<Hover> {
        const range = document.getWordRangeAtPosition(position, /\w+/);
        if (!range || document.getText(range) !== "main") {
            return undefined;
        }

        const line = document.lineAt(position);
        if (MAIN_METHOD_REGEX.test(line.text.trim()) && this.isMainMethod(line.text.trim())) {
            const commands: Command[] = [
                {
                    title: "Run",
                    command: JAVA_HOVER_RUN_COMMAND,
                    tooltip: "Run Java Program",
                    arguments: [ true, document.uri.toString(), { line: position.line, character: position.character }],
                },
                {
                    title: "Debug",
                    command: JAVA_HOVER_RUN_COMMAND,
                    tooltip: "Debug Java Program",
                    arguments: [ false, document.uri.toString(), { line: position.line, character: position.character }],
                },
            ];
            const contributed = new MarkdownString(commands.map((command) => this.convertCommandToMarkdown(command)).join(" | "));
            contributed.isTrusted = true;
            return new Hover(contributed);
        }

        return undefined;
    }

    private isMainMethod(line: string): boolean {
        const modifier: string = line.substring(0, line.indexOf("main"));
        const modifiers: string[] = modifier.split(/\s+/);
        return modifiers.indexOf("public") >= 0 && modifiers.indexOf("static") >= 0;
    }

    private convertCommandToMarkdown(command: Command): string {
        return `[${command.title}](command:${command.command}?` +
            `${encodeURIComponent(JSON.stringify(command.arguments || []))} "${command.tooltip || command.command}")`;
    }
}
