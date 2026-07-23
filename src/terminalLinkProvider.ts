// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken, commands, Position, ProviderResult, Range, TerminalLink, TerminalLinkContext,
    TerminalLinkProvider, Uri, window } from "vscode";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { resolveSourceUri } from "./languageServerPlugin";
import { parseJavaStackFrame } from "./stackFrameParser";

export class JavaTerminalLinkProvder implements TerminalLinkProvider<IJavaTerminalLink> {
    /**
     * Provide terminal links for the given context. Note that this can be called multiple times
     * even before previous calls resolve, make sure to not share global objects (eg. `RegExp`)
     * that could have problems when asynchronous usage may overlap.
     * @param context Information about what links are being provided for.
     * @param token A cancellation token.
     * @return A list of terminal links for the given line.
     */
    public provideTerminalLinks(context: TerminalLinkContext, _token: CancellationToken): ProviderResult<IJavaTerminalLink[]> {
        const isDebuggerTerminal: boolean = context.terminal.name.startsWith("Run:") || context.terminal.name.startsWith("Debug:");
        const frame = parseJavaStackFrame(context.line);
        if (frame) {
            return [{
                startIndex: frame.startIndex,
                length: frame.length,
                methodName: frame.methodName,
                stackTrace: frame.stackTrace,
                lineNumber: frame.lineNumber,
                isDebuggerTerminal,
            }];
        }

        return [];
    }

    /**
     * Handle an activated terminal link.
     */
    public async handleTerminalLink(link: IJavaTerminalLink): Promise<void> {
        sendInfo("", {
            operationName: "handleJavaTerminalLink",
            isDebuggerTerminal: String(link.isDebuggerTerminal),
        });
        const uri = await resolveSourceUri(link.stackTrace);
        if (uri) {
            const lineNumber = Math.max(link.lineNumber - 1, 0);
            window.showTextDocument(Uri.parse(uri), {
                preserveFocus: true,
                selection: new Range(new Position(lineNumber, 0), new Position(lineNumber, 0)),
            });
        } else {
            // If no source is found, then open the searching symbols quickpick box.
            const fullyQualifiedName = link.methodName.substring(0, link.methodName.lastIndexOf("."));
            const className = fullyQualifiedName.substring(fullyQualifiedName.lastIndexOf(".") + 1);
            commands.executeCommand("workbench.action.quickOpen", "#" + className);
        }
    }
}

interface IJavaTerminalLink extends TerminalLink {
    methodName: string;
    stackTrace: string;
    lineNumber: number;
    isDebuggerTerminal: boolean;
}
