// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import * as path from "path";
import { TextEditor, window } from "vscode";
import { IMainClassOption } from "./languageServerPlugin";

const defaultLabelFormatter = (option: IMainClassOption) => {
    return option.mainClass;
};
type Formatter = (option: IMainClassOption) => string;

class MainClassPicker {
    private cache: { [key: string]: number } = {};

    // tslint:disable-next-line
    public async showQuickPick(options: IMainClassOption[], placeHolder: string): Promise<IMainClassOption | undefined>;
    // tslint:disable-next-line
    public async showQuickPick(options: IMainClassOption[], placeHolder: string, labelFormatter: Formatter): Promise<IMainClassOption | undefined>;
    // tslint:disable-next-line
    public async showQuickPick(options: IMainClassOption[], placeHolder: string, autoPick: boolean): Promise<IMainClassOption | undefined>;
    // tslint:disable-next-line
    public async showQuickPick(options: IMainClassOption[], placeHolder: string, parameter3?: Formatter | boolean,
                               parameter4?: boolean): Promise<IMainClassOption | undefined> {
        let labelFormatter: Formatter = defaultLabelFormatter;
        let autoPick: boolean = true;
        if (typeof parameter3 === "function") {
            labelFormatter = parameter3;
        } else if (typeof parameter3 === "boolean") {
            autoPick = parameter3;
        }
        if (typeof parameter4 === "boolean") {
            autoPick = parameter4;
        }

        if (!options || !options.length) {
            return undefined;
        } else if (autoPick && options.length === 1) {
            return options[0];
        }

        const pickItems = options.map((option) => {
            return {
                label: labelFormatter(option),
                description: option.filePath ? path.basename(option.filePath) : "",
                detail: option.projectName ? `Project: ${option.projectName}` : "",
                data: option,
            };
        });

        const selected = await window.showQuickPick(pickItems, { placeHolder });
        if (selected) {
            return selected.data;
        }
        return undefined;
    }

    // tslint:disable-next-line
    public async showQuickPickWithRecentlyUsed(options: IMainClassOption[], placeHolder: string): Promise<IMainClassOption | undefined>;
    // tslint:disable-next-line
    public async showQuickPickWithRecentlyUsed(options: IMainClassOption[], placeHolder: string, labelFormatter: Formatter): Promise<IMainClassOption | undefined>;
    // tslint:disable-next-line
    public async showQuickPickWithRecentlyUsed(options: IMainClassOption[], placeHolder: string, autoPick: boolean): Promise<IMainClassOption | undefined>;
    // tslint:disable-next-line
    public async showQuickPickWithRecentlyUsed(options: IMainClassOption[], placeHolder: string, parameter3?: Formatter | boolean,
                                               parameter4?: boolean): Promise<IMainClassOption | undefined> {
        // Record the main class picking history in a most recently used cache.
        let labelFormatter: Formatter = defaultLabelFormatter;
        let autoPick: boolean = true;
        if (typeof parameter3 === "function") {
            labelFormatter = parameter3;
        } else if (typeof parameter3 === "boolean") {
            autoPick = parameter3;
        }
        if (typeof parameter4 === "boolean") {
            autoPick = parameter4;
        }

        if (!options || !options.length) {
            return undefined;
        } else if (autoPick && options.length === 1) {
            return options[0];
        }

        // Sort the Main Class options with the recently used timestamp.
        options.sort((a: IMainClassOption, b: IMainClassOption) => {
            return this.getMRUTimestamp(b) - this.getMRUTimestamp(a);
        });

        const mostRecentlyUsedOption: IMainClassOption | undefined = (options.length && this.contains(options[0])) ? options[0] : undefined;
        const isMostRecentlyUsed = (option: IMainClassOption): boolean => {
            return !!mostRecentlyUsedOption
                && mostRecentlyUsedOption.mainClass === option.mainClass
                && mostRecentlyUsedOption.projectName === option.projectName;
        };
        const isFromActiveEditor = (option: IMainClassOption): boolean => {
            const activeEditor: TextEditor | undefined = window.activeTextEditor;
            const currentActiveFile: string = _.get(activeEditor, "document.uri.fsPath");
            if (option.filePath && currentActiveFile) {
                return path.relative(option.filePath, currentActiveFile) === "";
            }
            return false;
        };
        const isPrivileged = (option: IMainClassOption): boolean => {
            return isMostRecentlyUsed(option) || isFromActiveEditor(option);
        };

        // Show the most recently used Main Class as the first one,
        // then the Main Class from Active Editor as second,
        // finally other Main Class.
        const adjustedOptions: IMainClassOption[] = [];
        options.forEach((option: IMainClassOption) => {
            if (isPrivileged(option)) {
                adjustedOptions.push(option);
            }
        });
        options.forEach((option: IMainClassOption) => {
            if (!isPrivileged(option)) {
                adjustedOptions.push(option);
            }
        });

        const pickItems = adjustedOptions.map((option) => {
            const adjustedDetail = [];
            if (isMostRecentlyUsed(option)) {
                adjustedDetail.push("$(clock) recently used");
            }

            if (isFromActiveEditor(option) && option.filePath) {
                adjustedDetail.push(`$(file-text) active editor (${path.basename(option.filePath)})`);
            }

            if (option.projectName) {
                adjustedDetail.push(`Project: ${option.projectName}`);
            }

            const detail: string = adjustedDetail.join(", ");

            return {
                label: labelFormatter ? labelFormatter(option) : defaultLabelFormatter(option),
                description: option.filePath ? path.basename(option.filePath) : "",
                detail,
                data: option,
            };
        });

        const selected = await window.showQuickPick(pickItems, { placeHolder });
        if (selected) {
            this.updateMRUTimestamp(selected.data);
            return selected.data;
        }
        return undefined;
    }

    /**
     * Checks whether the item options can be picked automatically without popping up the QuickPick box.
     * @param options the item options to pick
     * @param autoPick pick it automatically if only one option is available
     */
    public isAutoPicked(options: IMainClassOption[], autoPick?: boolean) {
        const shouldAutoPick: boolean = (autoPick === undefined ? true : !!autoPick);
        if (!options || !options.length) {
            return true;
        } else if (shouldAutoPick && options.length === 1) {
            return true;
        }

        return false;
    }

    private getMRUTimestamp(mainClassOption: IMainClassOption): number {
        return this.cache[this.getKey(mainClassOption)] || 0;
    }

    private updateMRUTimestamp(mainClassOption: IMainClassOption): void {
        this.cache[this.getKey(mainClassOption)] = Date.now();
    }

    private contains(mainClassOption: IMainClassOption): boolean {
        return Boolean(this.cache[this.getKey(mainClassOption)]);
    }

    private getKey(mainClassOption: IMainClassOption): string {
        return mainClassOption.mainClass + "|" + mainClassOption.projectName;
    }
}

export const mainClassPicker: MainClassPicker = new MainClassPicker();
