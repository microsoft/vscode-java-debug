// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken, commands, DocumentLink, DocumentLinkProvider, DocumentSelector,
    env, ExtensionContext, languages, Position, ProviderResult, Range, TextDocument, Uri,
    window, workspace } from "vscode";
import { instrumentOperationAsVsCodeCommand, sendInfo } from "vscode-extension-telemetry-wrapper";
import { resolveSourceUri } from "./languageServerPlugin";

const ANALYZE_STACK_TRACE_COMMAND = "java.debug.analyzeStackTrace";
const NAVIGATE_TO_STACK_FRAME_COMMAND = "_java.debug.navigateToStackFrame";

// Matches a Java stack frame such as `at module/com.foo.Bar.baz(Bar.java:42)`.
// Group 2: optional module prefix, group 3: fully-qualified method, group 5: `File.java:line`.
const STACK_FRAME_REGEX = /(\sat\s+)([\w$.]+\/)?(([\w$]+\.)+[<\w$>]+)\(([\w-$]+\.java:\d+)\)/;

// Guard against pathological input: cap the length of a scanned line (mitigates ReDoS on the
// nested-quantifier regex) and the number of links produced for very large logs.
const MAX_SCANNED_LINE_LENGTH = 1000;
const MAX_LINKS_PER_DOCUMENT = 2000;

// Only resolve to source locations the language server is expected to return.
const ALLOWED_SOURCE_SCHEMES = new Set<string>(["file", "jdt"]);

// Cap how much of the clipboard we scan when deciding whether to prefill (ReDoS hygiene).
const MAX_CLIPBOARD_SCAN_LENGTH = 20000;

// Records one content-free "impression" per document that first yields links, so feature reach
// (documents containing navigable traces) can be tracked separately from click engagement.
const impressionRecorded = new WeakSet<TextDocument>();

interface IStackFrameLinkArgs {
    stackTrace: string;
    methodName: string;
    lineNumber: number;
    documentSource: string;
}

// Categorizes where a trace lives without leaking the file path (telemetry stays content-free).
function categorizeDocumentSource(document: TextDocument): string {
    if (document.uri.scheme === "untitled") {
        return "untitled";
    }
    if (document.uri.scheme === "file") {
        return document.languageId === "log" ? "logFile" : "otherFile";
    }
    return "other";
}

/**
 * Linkifies Java stack frames in text documents (e.g. pasted traces or opened `.log` files),
 * so that each frame can be clicked to jump to the corresponding source line - without requiring
 * an active debug session. Resolution reuses the session-independent `resolveSourceUri` backend
 * and is performed lazily, only when a link is clicked.
 */
export class JavaStackTraceLinkProvider implements DocumentLinkProvider {
    public provideDocumentLinks(document: TextDocument, token: CancellationToken): ProviderResult<DocumentLink[]> {
        const documentSource = categorizeDocumentSource(document);
        const links: DocumentLink[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            if (token.isCancellationRequested || links.length >= MAX_LINKS_PER_DOCUMENT) {
                break;
            }

            const lineText = document.lineAt(i).text;
            if (lineText.length > MAX_SCANNED_LINE_LENGTH) {
                continue;
            }

            const result = STACK_FRAME_REGEX.exec(lineText);
            if (!result || !result.length) {
                continue;
            }

            const stackTrace = `${result[2] || ""}${result[3]}(${result[5]})`;
            const lineNumber = Number(result[5].split(":")[1]);
            const startIndex = result.index + result[1].length;
            const range = new Range(new Position(i, startIndex), new Position(i, startIndex + stackTrace.length));

            const args: IStackFrameLinkArgs = { stackTrace, methodName: result[3], lineNumber, documentSource };
            const target = Uri.parse(`command:${NAVIGATE_TO_STACK_FRAME_COMMAND}?${encodeURIComponent(JSON.stringify(args))}`);
            links.push(new DocumentLink(range, target));
        }

        if (links.length > 0 && !impressionRecorded.has(document)) {
            impressionRecorded.add(document);
            /* __GDPR__
               "provideJavaStackTraceLinks" : {
                   "owner": "vscode-java-debug",
                   "comment": "Emitted once per document that first yields navigable Java stack-trace links; measures feature reach.",
                   "operationName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                   "documentSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
               }
             */
            sendInfo("", { operationName: "provideJavaStackTraceLinks", documentSource });
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

    const uri = await resolveSourceUri(args.stackTrace);
    const parsed = uri ? Uri.parse(uri) : undefined;

    let resolution: string;
    if (!parsed) {
        resolution = "fallbackQuickPick";
    } else if (ALLOWED_SOURCE_SCHEMES.has(parsed.scheme)) {
        resolution = "resolved";
    } else {
        resolution = "schemeRejected";
    }

    // Content-free telemetry: only categorical dimensions, never the pasted text.
    /* __GDPR__
       "navigateToJavaStackFrame" : {
           "owner": "vscode-java-debug",
           "comment": "Emitted when a user clicks a linkified Java stack frame; measures click engagement and resolution success.",
           "operationName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "documentSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "resolution": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
       }
     */
    sendInfo("", {
        operationName: "navigateToJavaStackFrame",
        documentSource: args.documentSource || "unknown",
        resolution,
    });

    if (parsed && ALLOWED_SOURCE_SCHEMES.has(parsed.scheme)) {
        const targetLine = Math.max(args.lineNumber - 1, 0);
        window.showTextDocument(parsed, {
            preserveFocus: true,
            selection: new Range(new Position(targetLine, 0), new Position(targetLine, 0)),
        });
    } else if (!parsed) {
        // No source found: open the symbol quick pick scoped to the class name.
        const fullyQualifiedName = args.methodName.substring(0, args.methodName.lastIndexOf("."));
        const className = fullyQualifiedName.substring(fullyQualifiedName.lastIndexOf(".") + 1);
        commands.executeCommand("workbench.action.quickOpen", "#" + className);
    }
}

/**
 * Opens a scratch document for pasting an external stack trace. If the clipboard already holds a
 * stack trace, it is prefilled so the frames become clickable immediately.
 */
async function analyzeStackTrace(): Promise<void> {
    const clipboard = await env.clipboard.readText();
    const prefilled = STACK_FRAME_REGEX.test(clipboard.slice(0, MAX_CLIPBOARD_SCAN_LENGTH));

    /* __GDPR__
       "analyzeJavaStackTrace" : {
           "owner": "vscode-java-debug",
           "comment": "Emitted when a user runs the 'Analyze Stack Trace' command; measures explicit entry-point usage.",
           "operationName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "prefilledFromClipboard": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
       }
     */
    sendInfo("", { operationName: "analyzeJavaStackTrace", prefilledFromClipboard: String(prefilled) });

    const document = await workspace.openTextDocument({ language: "log", content: prefilled ? clipboard : "" });
    await window.showTextDocument(document);
}

export function registerStackTraceLinkProvider(context: ExtensionContext): void {
    const selector: DocumentSelector = [
        { scheme: "untitled" },
        { language: "log" },
        { pattern: "**/*.log" },
    ];

    context.subscriptions.push(
        languages.registerDocumentLinkProvider(selector, new JavaStackTraceLinkProvider()),
        commands.registerCommand(NAVIGATE_TO_STACK_FRAME_COMMAND, navigateToStackFrame),
        instrumentOperationAsVsCodeCommand(ANALYZE_STACK_TRACE_COMMAND, analyzeStackTrace),
    );
}
