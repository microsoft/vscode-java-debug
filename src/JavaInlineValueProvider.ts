// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { debug, InlineValue, InlineValueContext, InlineValueEvaluatableExpression, InlineValuesProvider, InlineValueText, InlineValueVariableLookup,
    Range, TextDocument } from "vscode";
import { instrumentOperation, instrumentOperationStep, sendInfo } from "vscode-extension-telemetry-wrapper";
import * as CodeConverter from "vscode-languageclient/lib/codeConverter";
import * as ProtocolConverter from "vscode-languageclient/lib/protocolConverter";
import { InlineKind, InlineVariable, resolveInlineVariables } from "./languageServerPlugin";

const protoConverter: ProtocolConverter.Converter = ProtocolConverter.createConverter();
const codeConverter: CodeConverter.Converter = CodeConverter.createConverter();

export class JavaInlineValuesProvider implements InlineValuesProvider {

    public async provideInlineValues(document: TextDocument, viewPort: Range, context: InlineValueContext): Promise<InlineValue[]> {
        const provideInlineValuesOperation = instrumentOperation("provideInlineValues", async (operationId) => {
            const resolveInlineVariablesStep = instrumentOperationStep(operationId, "resolveInlineVariables", async () => {
                return <InlineVariable[]> (await resolveInlineVariables({
                    uri: document.uri.toString(),
                    viewPort: codeConverter.asRange(viewPort),
                    stoppedLocation: codeConverter.asRange(context.stoppedLocation),
                }));
            });
            const variables: InlineVariable[] = await resolveInlineVariablesStep();

            const resolveInlineValuesStep = instrumentOperationStep(operationId, "resolveInlineValues", async () => {
                if (!variables || !variables.length) {
                    sendInfo(operationId, {
                        inlineVariableCount: 0,
                    });
                    return [];
                }

                const unresolvedVariables: any[] = variables.filter((variable) => variable.kind === InlineKind.Evaluation).map((variable) => {
                    return {
                        expression: variable.expression || variable.name,
                        declaringClass: variable.declaringClass,
                    };
                });
                sendInfo(operationId, {
                    inlineVariableCount: variables.length,
                    inlineVariableLookupCount: variables.length - unresolvedVariables.length,
                    inlineVariableEvaluationCount: unresolvedVariables.length,
                });

                let resolvedVariables: any;
                if (unresolvedVariables.length && debug.activeDebugSession) {
                    const response = await debug.activeDebugSession.customRequest("inlineValues", {
                        frameId: context.frameId,
                        variables: unresolvedVariables,
                    });
                    resolvedVariables = response?.variables;
                }

                const result: InlineValue[] = [];
                let next = 0;
                for (const variable of variables) {
                    if (variable.kind === InlineKind.VariableLookup) {
                        result.push(new InlineValueVariableLookup(protoConverter.asRange(variable.range), variable.name, true));
                    } else if (resolvedVariables && resolvedVariables.length > next) {
                        const resolvedValue = resolvedVariables[next++];
                        if (resolvedValue) {
                            result.push(new InlineValueText(protoConverter.asRange(variable.range), `${variable.name} = ${resolvedValue.value}`));
                        } else {
                            result.push(new InlineValueEvaluatableExpression(protoConverter.asRange(variable.range), variable.name));
                        }
                    } else {
                        result.push(new InlineValueEvaluatableExpression(protoConverter.asRange(variable.range), variable.name));
                    }
                }

                return result;
            });
            return resolveInlineValuesStep();
        });

        return provideInlineValuesOperation();
    }

}
