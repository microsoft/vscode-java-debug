// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DebugAdapterDescriptor, DebugAdapterDescriptorFactory, DebugAdapterExecutable, DebugAdapterServer, DebugSession } from "vscode";
import { Type } from "./javaLogger";
import { startDebugSession } from "./languageServerPlugin";
import { convertErrorToMessage, showErrorMessageWithTroubleshooting } from "./utility";

export class JavaDebugAdapterDescriptorFactory implements DebugAdapterDescriptorFactory {
    public async createDebugAdapterDescriptor(_session: DebugSession,
                                              _executable: DebugAdapterExecutable): Promise<DebugAdapterDescriptor | undefined> {
        let error: Error| undefined;
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
        return undefined;
    }
}
