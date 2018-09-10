// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as _ from "lodash";
import * as path from "path";
import * as vscode from "vscode";
export interface IProcessEnv {
    [key: string]: string | undefined;
}

function isWin(): boolean {
    return /^win/.test(process.platform);
}

function hasDriveLetter(_path: string): boolean {
    return isWindows && _path && _path[1] === ":";
}

function normalizeDriveLetter(_path: string): string {
    if (hasDriveLetter(_path)) {
        return _path.charAt(0).toUpperCase() + _path.slice(1);
    }

    return _path;
}
const isWindows = isWin();

export class VariableResolver {
    private static VARIABLE_REGEXP = /\$\{(.*?)\}/g;

    public constructor(private readonly _envVariables: IProcessEnv = process.env) {
        if (isWindows) {
            this._envVariables = Object.create(null);
            Object.keys(_envVariables).forEach((key) => {
                this._envVariables[key.toLowerCase()] = _envVariables[key];
            });
        }
    }
    public resolveString(folderUri: vscode.Uri, value: string): string {

        const filePath = this.getFilePath();
        return value.replace(VariableResolver.VARIABLE_REGEXP, (match: string, variable: string) => {

            let argument: string;
            const parts = variable.split(":");
            if (parts && parts.length > 1) {
                variable = parts[0];
                argument = parts[1];
            }

            switch (variable) {

                case "env":
                    if (argument) {
                        if (isWindows) {
                            argument = argument.toLowerCase();
                        }
                        const env = this._envVariables[argument];
                        if (_.isString(env)) {
                            return env;
                        }
                        // For `env` we should do the same as a normal shell does - evaluates missing envs to an empty string #46436
                        return "";
                    }
                    throw new Error(`missingEnvVarName: '${match}' can not be resolved because no environment variable name is given.`);

                case "config":
                    if (argument) {
                        const config = this.getConfigurationValue(folderUri, argument);
                        if (_.isUndefined(config) || _.isNull(config)) {
                            throw new Error(`configNotFound: '${match}' can not be resolved because setting '${argument}' not found.`);
                        }
                        if (_.isObject(config)) {
                            throw new Error(`configNoString: '${match}' can not be resolved because '${argument}' is a structured value.`);
                        }
                        return config;
                    }
                    throw new Error(`missingConfigName: '${match}' can not be resolved because no settings name is given.`);

                default: {

                    // common error handling for all variables that require an open folder and accept a folder name argument
                    switch (variable) {
                        case "workspaceRoot":
                        case "workspaceFolder":
                        case "workspaceRootFolderName":
                        case "workspaceFolderBasename":
                        case "relativeFile":
                            if (argument) {
                                const folder = this.getFolderUri(argument);
                                if (folder) {
                                    folderUri = folder;
                                } else {
                                    throw new Error(`canNotFindFolder: '${match}' can not be resolved. No such folder '${argument}'.`);
                                }
                            }
                            if (!folderUri) {
                                if (this.getWorkspaceFolderCount() > 1) {
                                    throw new Error(`canNotResolveWorkspaceFolderMultiRoot: '${match}' ` +
                                        `can not be resolved in a multi folder workspace. ` +
                                        `Scope this variable using ":' and a workspace folder name.`);
                                }
                                throw new Error(`canNotResolveWorkspaceFolder: '${match}' can not be resolved. Please open a folder.`);
                            }
                            break;
                        default:
                            break;
                    }

                    // common error handling for all variables that require an open file
                    switch (variable) {
                        case "file":
                        case "relativeFile":
                        case "fileDirname":
                        case "fileExtname":
                        case "fileBasename":
                        case "fileBasenameNoExtension":
                            if (!filePath) {
                                throw new Error(`canNotResolveFile: '${match}' can not be resolved. Please open an editor.`);
                            }
                            break;
                        default:
                            break;
                    }

                    switch (variable) {
                        case "workspaceRoot":
                        case "workspaceFolder":
                            return normalizeDriveLetter(folderUri.fsPath);

                        case "cwd":
                            return folderUri ? normalizeDriveLetter(folderUri.fsPath) : process.cwd();

                        case "workspaceRootFolderName":
                        case "workspaceFolderBasename":
                            return path.basename(folderUri.fsPath);

                        case "lineNumber":
                            const lineNumber = this.getLineNumber();
                            if (lineNumber) {
                                return lineNumber;
                            }
                            throw new Error(`canNotResolveLineNumber: '${match}' can not be resolved.` +
                                ` Make sure to have a line selected in the active editor.`);

                        case "selectedText":
                            const selectedText = this.getSelectedText();
                            if (selectedText) {
                                return selectedText;
                            }
                            throw new Error(`canNotResolveSelectedText: '${match}' can not be resolved.` +
                                ` Make sure to have some text selected in the active editor.`);

                        case "file":
                            return filePath;

                        case "relativeFile":
                            if (folderUri) {
                                return path.normalize(path.relative(folderUri.fsPath, filePath));
                            }
                            return filePath;

                        case "fileDirname":
                            return path.dirname(filePath);

                        case "fileExtname":
                            return path.extname(filePath);

                        case "fileBasename":
                            return path.basename(filePath);

                        case "fileBasenameNoExtension":
                            const basename = path.basename(filePath);
                            return basename.slice(0, basename.length - path.extname(basename).length);

                        case "execPath":
                            const ep = process.execPath;
                            if (ep) {
                                return ep;
                            }
                            return match;

                        default:
                            return match;
                    }
                }
            }
        });
    }

    private getFilePath(): string | undefined {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const resource = activeEditor.document.uri;
            if (resource.scheme === "file") {
                return path.normalize(resource.fsPath);
            }
        }
        return undefined;
    }

    private getSelectedText(): string | undefined {
        const activeTextEditor = vscode.window.activeTextEditor;
        if (activeTextEditor && activeTextEditor.selection) {
            return activeTextEditor.document.getText(activeTextEditor.selection);
        }
        return undefined;
    }

    private getLineNumber(): string | undefined {
        const activeTextEditor = vscode.window.activeTextEditor;
        if (activeTextEditor && activeTextEditor.selection) {
            return String(activeTextEditor.selection.start.line);
        }
        return undefined;
    }

    private getConfigurationValue(folderUri: vscode.Uri, suffix: string): string {

        const configuration = vscode.workspace.getConfiguration(undefined, folderUri);
        const configValue = configuration.get(suffix);
        return String(configValue);
    }

    private getWorkspaceFolderCount(): number {
        return vscode.workspace.workspaceFolders.length;
    }

    private getFolderUri(folderName: string): vscode.Uri {
        const folder = vscode.workspace.workspaceFolders.filter((f) => f.name === folderName).pop();
        return folder ? folder.uri : undefined;
    }
}
