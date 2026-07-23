// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken, commands, DocumentLink, DocumentLinkProvider, DocumentSelector,
    env, ExtensionContext, languages, Position, ProviderResult, Range, TextDocument, Uri,
    window, workspace } from "vscode";
import { instrumentOperationAsVsCodeCommand, sendInfo } from "vscode-extension-telemetry-wrapper";
import { resolveSourceUri } from "./languageServerPlugin";
import { parseJavaStackFrame } from "./stackFrameParser";
import { getJavaExtensionAPI, isJavaExtEnabled, ServerMode } from "./utility";

const ANALYZE_STACK_TRACE_COMMAND = "java.debug.analyzeStackTrace";
const NAVIGATE_TO_STACK_FRAME_COMMAND = "_java.debug.navigateToStackFrame";

// Only linkify pasted traces in untitled (scratch) documents - including the one opened by the
// `Analyze Stack Trace` command. Kept deliberately narrow: a `.log` opened without a Java project
// couldn't resolve anyway, so we don't scan `.log` files or every plaintext file the user opens.
const STACK_TRACE_DOCUMENT_SELECTOR: DocumentSelector = [
    { scheme: "untitled" },
];

// Guard against pathological input: cap the length of a scanned line (mitigates ReDoS on the
// nested-quantifier regex) and the number of links produced for very large pasted traces.
const MAX_SCANNED_LINE_LENGTH = 1000;
const MAX_LINKS_PER_DOCUMENT = 2000;

// Only resolve to source locations the language server is expected to return.
const ALLOWED_SOURCE_SCHEMES = new Set<string>(["file", "jdt"]);

// Cap how much of the clipboard we scan when deciding whether to prefill (ReDoS hygiene).
const MAX_CLIPBOARD_SCAN_LENGTH = 20000;

interface IStackFrameLinkArgs {
    stackTrace: string;
    methodName: string;
    lineNumber: number;
}

/**
 * Linkifies Java stack frames pasted into untitled (scratch) documents, so that each frame can be
 * clicked to jump to the corresponding source line - without requiring an active debug session.
 * Resolution reuses the session-independent `resolveSourceUri` backend and is performed lazily,
 * only when a link is clicked.
 */
export class JavaStackTraceLinkProvider implements DocumentLinkProvider {
    public provideDocumentLinks(document: TextDocument, token: CancellationToken): ProviderResult<DocumentLink[]> {
        const links: DocumentLink[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            if (token.isCancellationRequested || links.length >= MAX_LINKS_PER_DOCUMENT) {
                break;
            }

            const lineText = document.lineAt(i).text;
            if (lineText.length > MAX_SCANNED_LINE_LENGTH) {
                continue;
            }

            const frame = parseJavaStackFrame(lineText);
            if (!frame) {
                continue;
            }

            const range = new Range(
                new Position(i, frame.startIndex),
                new Position(i, frame.startIndex + frame.length),
            );

            const args: IStackFrameLinkArgs = {
                stackTrace: frame.stackTrace,
                methodName: frame.methodName,
                lineNumber: frame.lineNumber,
            };
            const target = Uri.parse(`command:${NAVIGATE_TO_STACK_FRAME_COMMAND}?${encodeURIComponent(JSON.stringify(args))}`);
            links.push(new DocumentLink(range, target));
        }

        return links;
    }
}

/**
 * Resolves a stack frame to its source location and navigates to it. Mirrors the behavior of the
 * terminal link provider: jump to the resolved source line, or fall back to a symbol quick pick.
 */
async function navigateToStackFrame(args: IStackFrameLinkArgs): Promise<void> {
    if (!args || !args.stackTrace) {
        return;
    }

    // Content-free telemetry: a single usage signal (click count), mirroring the terminal link
    // provider. No dimensions - the pasted text is never recorded.
    /* __GDPR__
       "navigateToJavaStackFrame" : {
           "owner": "vscode-java-debug",
           "comment": "Emitted when a user clicks a linkified Java stack frame; measures feature usage.",
           "operationName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
       }
     */
    sendInfo("", { operationName: "navigateToJavaStackFrame" });

    try {
        const uri = await resolveSourceUri(args.stackTrace);
        if (uri) {
            const parsed = Uri.parse(uri);
            if (!ALLOWED_SOURCE_SCHEMES.has(parsed.scheme)) {
                return;
            }
            const targetLine = Math.max(args.lineNumber - 1, 0);
            await window.showTextDocument(parsed, {
                preserveFocus: true,
                selection: new Range(new Position(targetLine, 0), new Position(targetLine, 0)),
            });
        } else {
            // No source found: open the symbol quick pick scoped to the class name.
            const fullyQualifiedName = args.methodName.substring(0, args.methodName.lastIndexOf("."));
            const className = fullyQualifiedName.substring(fullyQualifiedName.lastIndexOf(".") + 1);
            await commands.executeCommand("workbench.action.quickOpen", "#" + className);
        }
    } catch {
        // The internal navigate command is always registered, but resolving a frame needs the Java
        // language server in Standard mode. If it isn't (e.g. server restarting/downgraded) or the
        // resolved document fails to open, fail quietly instead of surfacing an unhandled rejection.
    }
}

/**
 * Opens a scratch document for pasting an external stack trace. If the clipboard already holds a
 * stack trace, it is prefilled so the frames become clickable immediately.
 */
async function analyzeStackTrace(): Promise<void> {
    // The command itself is auto-instrumented via instrumentOperationAsVsCodeCommand, so no
    // manual telemetry is needed here to track invocations.
    const clipboard = await env.clipboard.readText();
    const looksLikeTrace = parseJavaStackFrame(clipboard.slice(0, MAX_CLIPBOARD_SCAN_LENGTH)) !== undefined;
    const content = looksLikeTrace ? clipboard : "";
    const document = await workspace.openTextDocument({ language: "log", content });
    await window.showTextDocument(document);
}

export function registerStackTraceLinkProvider(context: ExtensionContext): void {
    // The commands are always available: the palette command must not depend on server
    // readiness, and the click handler is only ever reached from links the provider creates.
    context.subscriptions.push(
        commands.registerCommand(NAVIGATE_TO_STACK_FRAME_COMMAND, navigateToStackFrame),
        instrumentOperationAsVsCodeCommand(ANALYZE_STACK_TRACE_COMMAND, analyzeStackTrace),
    );

    // Linkifying a frame is only meaningful once the Java language server is in Standard mode,
    // because resolving a frame to source (resolveSourceUri) requires a fully-loaded workspace.
    // Defer registering the link provider until then, mirroring the run/debug CodeLens provider.
    registerLinkProviderWhenReady(context);
}

function registerLinkProviderWhenReady(context: ExtensionContext): void {
    // Without the Java language server, frames cannot be resolved to source - nothing to linkify.
    if (!isJavaExtEnabled()) {
        return;
    }

    const doRegister = () => context.subscriptions.push(
        languages.registerDocumentLinkProvider(STACK_TRACE_DOCUMENT_SELECTOR, new JavaStackTraceLinkProvider()),
    );

    getJavaExtensionAPI().then((api) => {
        if (!api) {
            return;
        }

        if (api.serverMode === ServerMode.LIGHTWEIGHT || api.serverMode === ServerMode.HYBRID) {
            let registered = false;
            context.subscriptions.push(api.onDidServerModeChange((mode: string) => {
                if (mode === ServerMode.STANDARD && !registered) {
                    registered = true;
                    doRegister();
                }
            }));
        } else {
            // Already in Standard mode.
            doRegister();
        }
    });
}
