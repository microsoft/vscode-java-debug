// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DebugAdapterDescriptor, DebugAdapterDescriptorFactory, DebugAdapterExecutable, DebugAdapterServer, DebugSession } from "vscode";

import { startDebugSession } from "./languageServerPlugin";
import { Type } from "./logger";
import { convertErrorToMessage, showErrorMessageWithTroubleshooting } from "./utility";

export class JavaDebugAdapterDescriptorFactory implements DebugAdapterDescriptorFactory {
    public async createDebugAdapterDescriptor(session: DebugSession, executable: DebugAdapterExecutable): Promise<DebugAdapterDescriptor> {
        let error;
        try {
            const debugServerPort = <number> (await startDebugSession());
            if (debugServerPort) {
                return new DebugAdapterServer(debugServerPort);
            } else {
                // Information for diagnostic:
                // tslint:disable-next-line:no-console
                console.log("Cannot find a port for debugging session");
            }
        } catch (err) {
            error = err;
        }

        const message = error ? convertErrorToMessage(error) : {
            type: Type.EXCEPTION,
            message: "Failed to start debug server.",
        };
        showErrorMessageWithTroubleshooting(message);
    }
}
