// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { sendInfo, sendOperationError } from "vscode-extension-telemetry-wrapper";

export enum Type {
    EXCEPTION = "exception",
    USAGEDATA = "usageData",
    USAGEERROR = "usageError",
    ACTIVATEEXTENSION = "activateExtension", // TODO: Activation belongs to usage data, remove this category.
}

export function logJavaException(errorProperties: any): void {
    /**
     *  A sample errorProperties from Java code.
     * {
     *   "description": "Failed to attach to remote debuggee VM. Reason: java.net.ConnectException: Connection refused: connect",
     *   "message": "Failed to attach to remote debuggee VM. Reason: java.net.ConnectException: Connection refused: connect",
     *   "stackTrace": "[{\"declaringClass\":\"com.microsoft.java.debug.core.adapter.AdapterUtils\", ...]",
     *   "debugSessionid": "5680f12b-5b5f-4ac0-bda3-d1dbc3c12c10",
     * }
     */
    const { debugSessionId, description, message, stackTrace } = errorProperties;
    sendOperationError(debugSessionId, "debugSession", {
        name: "JavaException",
        message: description || message,
        stack: stackTrace,
    });
}

export function logJavaInfo(commonProperties: any, measureProperties?: any): void {
    if (measureProperties && measureProperties.duration !== undefined) {
        sendInfo(commonProperties.debugSessionId, commonProperties, measureProperties);
    } else {
        sendInfo(commonProperties.debugSessionId, commonProperties);
    }
}
