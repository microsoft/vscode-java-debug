// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as compareVersions from "compare-versions";
import { debug, InlineValue, InlineValueContext, InlineValueEvaluatableExpression, InlineValuesProvider, InlineValueText, InlineValueVariableLookup,
    Position, Range, TextDocument, version } from "vscode";
import { InlineKind, InlineVariable, LSPRange, resolveInlineVariables } from "./languageServerPlugin";

// In VS Code 1.55.0, viewport doesn't change while scrolling the editor and it's fixed in 1.56.0.
// So dynamically enable viewport support based on the user's VS Code version.
const isViewPortSupported = compareVersions(version.replace(/-insider$/i, ""), "1.56.0") >= 0;
export class JavaInlineValuesProvider implements InlineValuesProvider {

    public async provideInlineValues(document: TextDocument, viewPort: Range, context: InlineValueContext): Promise<InlineValue[]> {
        const variables: InlineVariable[] = <InlineVariable[]> (await resolveInlineVariables({
            uri: document.uri.toString(),
            viewPort: isViewPortSupported ? asLSPRange(viewPort) : undefined,
            stoppedLocation: asLSPRange(context.stoppedLocation),
        }));
        if (!variables || !variables.length) {
            return [];
        }

        const unresolvedVariables: any[] = variables.filter((variable) => variable.kind === InlineKind.Evaluation).map((variable) => {
            return {
                expression: variable.expression || variable.name,
                declaringClass: variable.declaringClass,
            };
        });
        let resolvedVariables: any;
        if (unresolvedVariables.length && debug.activeDebugSession) {
            const response = await debug.activeDebugSession.customRequest("inlineValues", {
                frameId: context.frameId,
                variables: unresolvedVariables,
            });
            resolvedVariables = response && response.variables ? response.variables : undefined;
        }

        const result: InlineValue[] = [];
        let next = 0;
        for (const variable of variables) {
            if (variable.kind === InlineKind.VariableLookup) {
                result.push(new InlineValueVariableLookup(asClientRange(variable.range), variable.name, true));
            } else if (resolvedVariables && resolvedVariables.length > next) {
                const resolvedValue = resolvedVariables[next++];
                if (resolvedValue) {
                    result.push(new InlineValueText(asClientRange(variable.range), `${variable.name} = ${resolvedValue.value}`));
                } else {
                    result.push(new InlineValueEvaluatableExpression(asClientRange(variable.range), variable.name));
                }
            } else {
                result.push(new InlineValueEvaluatableExpression(asClientRange(variable.range), variable.name));
            }
        }

        return result;
    }

}

function asLSPRange(range: Range): LSPRange {
    return {
        start: {
            line: range.start.line,
            character: range.start.character,
        },
        end: {
            line: range.end.line,
            character: range.end.character,
        },
    };
}

function asClientRange(range: LSPRange) {
    return new Range(new Position(range.start.line, range.start.character), new Position(range.end.line, range.end.character));
}
