// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { resolveClassFilters } from "./languageServerPlugin";

export async function populateStepFilters(config: vscode.DebugConfiguration) {
    if (!config.stepFilters) {
        return;
    }

    const skipClasses = await substituteFilterVariables(config.stepFilters.skipClasses);
    // Migrate classNameFilters to skipClasses.
    if (Array.isArray(config.stepFilters.classNameFilters)) {
        mergeResult(config.stepFilters.classNameFilters, skipClasses);
    }
    config.stepFilters.classNameFilters = undefined;
    config.stepFilters.skipClasses = skipClasses;
}

export async function substituteFilterVariables(skipClasses: string[]): Promise<any> {
    if (!skipClasses) {
        return [];
    }

    try {
        // Preprocess skipClasses configurations.
        if (Array.isArray(skipClasses)) {
            const hasReservedName = skipClasses.some((filter) => filter === "$JDK" || filter === "$Libraries");
            return hasReservedName ? await resolveClassFilters(skipClasses) : skipClasses;
        } else {
            // tslint:disable-next-line:no-console
            console.error("Invalid type for skipClasses config:" + skipClasses);
        }
    } catch (e) {
        // tslint:disable-next-line:no-console
        console.error(e);
    }

    return [];
}

function mergeResult(newItems: any[], result: string[]) {
    newItems.forEach((item) => {
        if (result.indexOf(item) < 0) {
            result.push(String(item));
        }
    });
}
