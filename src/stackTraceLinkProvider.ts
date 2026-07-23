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

// Linkify stack traces in scratch documents and .log files. Other plaintext documents stay
// excluded so the extension does not passively scan unrelated files.
const STACK_TRACE_DOCUMENT_SELECTOR: DocumentSelector = [
    { scheme: "untitled" },
    { pattern: "**/*.log" },
];

// Bound the work performed for large documents and pathological input. The per-line cap mitigates
// ReDoS in the nested-quantifier regex; the document budgets keep large logs from being fully scanned.
const MAX_SCANNED_LINE_LENGTH = 1000;
const MAX_SCANNED_LINES_PER_DOCUMENT = 10000;
const MAX_SCANNED_CHARACTERS_PER_DOCUMENT = 1000000;
const MAX_LINKS_PER_DOCUMENT = 2000;

// Only resolve to source locations the language server is expected to return.
const ALLOWED_SOURCE_SCHEMES = new Set<string>(["file", "jdt"]);

interface IStackFrameLinkArgs {
    stackTrace: string;
    methodName: string;
    lineNumber: number;
}

function isStackFrameLinkArgs(args: unknown): args is IStackFrameLinkArgs {
    if (typeof args !== "object" || args === null) {
        return false;
    }

    const stackTrace = "stackTrace" in args ? args.stackTrace : undefined;
    const methodName = "methodName" in args ? args.methodName : undefined;
    const lineNumber = "lineNumber" in args ? args.lineNumber : undefined;
    if (typeof stackTrace !== "string" || typeof methodName !== "string" || typeof lineNumber !== "number"
            || stackTrace.length === 0 || stackTrace.length > MAX_SCANNED_LINE_LENGTH
            || !Number.isSafeInteger(lineNumber) || lineNumber <= 0) {
        return false;
    }

    const frame = parseJavaStackFrame(` at ${stackTrace}`);
    return frame?.stackTrace === stackTrace
        && frame.methodName === methodName
        && frame.lineNumber === lineNumber;
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
        let scannedCharacters = 0;
        const linesToScan = Math.min(document.lineCount, MAX_SCANNED_LINES_PER_DOCUMENT);
        for (let i = 0; i < linesToScan; i++) {
            if (token.isCancellationRequested || links.length >= MAX_LINKS_PER_DOCUMENT) {
                break;
            }

            const lineText = document.lineAt(i).text;
            const lineScanCost = lineText.length + 1;
            if (scannedCharacters + lineScanCost > MAX_SCANNED_CHARACTERS_PER_DOCUMENT) {
                break;
            }
            scannedCharacters += lineScanCost;

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
            const target = Uri.parse(`command:${NAVIGATE_TO_STACK_FRAME_COMMAND}?${encodeURIComponent(JSON.stringify([args]))}`);
            links.push(new DocumentLink(range, target));
        }

        return links;
    }
}

/**
 * Resolves a stack frame to its source location and navigates to it. Mirrors the behavior of the
 * terminal link provider: jump to the resolved source line, or fall back to a symbol quick pick.
 */
async function navigateToStackFrame(args: unknown): Promise<void> {
    if (!isStackFrameLinkArgs(args)) {
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
 * Opens a scratch document prefilled with the clipboard content. The document link provider scans
 * a bounded portion after the document opens and makes any stack frames clickable.
 */
async function analyzeStackTrace(): Promise<void> {
    // The command itself is auto-instrumented via instrumentOperationAsVsCodeCommand, so no
    // manual telemetry is needed here to track invocations.
    const clipboardContent = await env.clipboard.readText();
    const document = await workspace.openTextDocument({ language: "log", content: clipboardContent });
    await window.showTextDocument(document);
}

export function registerStackTraceLinkProvider(context: ExtensionContext): void {
    // Register handlers immediately for programmatic invocations and existing command links.
    // Palette visibility and creation of new links are gated on language-server readiness elsewhere.
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
            const serverModeListener = api.onDidServerModeChange((mode: string) => {
                if (mode === ServerMode.STANDARD && !registered) {
                    registered = true;
                    serverModeListener.dispose();
                    doRegister();
                }
            });
            context.subscriptions.push(serverModeListener);
        } else {
            // Already in Standard mode.
            doRegister();
        }
    });
}
