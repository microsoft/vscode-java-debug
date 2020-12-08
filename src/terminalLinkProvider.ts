// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken, commands, Position, ProviderResult, Range, TerminalLink, TerminalLinkContext,
    TerminalLinkProvider, Uri, window } from "vscode";
import { resolveSourceUri } from "./languageServerPlugin";

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
        if (context.terminal.name !== "Java Debug Console" && context.terminal.name !== "Java Process Console") {
            return [];
        }

        const regex = new RegExp("(\\sat\\s+)([\\w$\\.]+\\/)?(([\\w$]+\\.)+[<\\w$>]+)\\(([\\w-$]+\\.java:\\d+)\\)");
        const result: RegExpExecArray | null = regex.exec(context.line);
        if (result && result.length) {
            const stackTrace = `${result[2] || ""}${result[3]}(${result[5]})`;
            const sourceLineNumber = Number(result[5].split(":")[1]);
            return [{
                startIndex: result.index + result[1].length,
                length: stackTrace.length,
                methodName: result[3],
                stackTrace,
                lineNumber: sourceLineNumber,
            }];
        }

        return [];
    }

    /**
     * Handle an activated terminal link.
     */
    public async handleTerminalLink(link: IJavaTerminalLink): Promise<void> {
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
}
