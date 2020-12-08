// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { v4 } from "uuid";
import { CancellationToken, CancellationTokenSource, commands, Disposable, EventEmitter, ExtensionContext, ProgressLocation,
    StatusBarAlignment, StatusBarItem, window, workspace } from "vscode";
import { IProgressReporter, IProgressReporterManager } from "./progressAPI";

const showProgressNotificationCommand = "_java.debug.showProgressNotification";
export function registerProgressReporters(context: ExtensionContext) {
    context.subscriptions.push(commands.registerCommand(showProgressNotificationCommand, async (progressReporter: JavaProgressReporter) => {
        progressReporter.showProgressNotification();
    }));
}

class JavaProgressReporter implements IProgressReporter {
    public jobName: string;
    public subTaskName: string;
    public detailedMessage: string = "Building Java workspace...";

    private _id: string = v4();
    private _tokenSource = new CancellationTokenSource();
    private _statusBarItem: StatusBarItem | undefined;
    private _isProgressNotificationRunning: boolean = false;
    private _cancelEventEmitter: EventEmitter<any>;
    private _progressEventEmitter: EventEmitter<any>;
    private _disposables: Disposable[] = [];

    constructor(jobName: string, showInStatusBar?: boolean) {
        this.jobName = jobName || "Java Job Status";
        const config = workspace.getConfiguration("java.debug.settings");
        if (showInStatusBar || !config.showRunStatusAsNotification) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 1);
            this._statusBarItem.text = "$(sync~spin) Building...";
            this._statusBarItem.command = {
                title: "Check Java Build Status",
                command: showProgressNotificationCommand,
                arguments: [ this ],
            };
            this._statusBarItem.tooltip = "Check Java Build Status";
            this._disposables.push(this._statusBarItem);
        }

        this._cancelEventEmitter = new EventEmitter<any>();
        this._progressEventEmitter = new EventEmitter<any>();
        this._disposables.push(this._cancelEventEmitter);
        this._disposables.push(this._progressEventEmitter);
        this._disposables.push(this._tokenSource);
    }

    public getId(): string {
        return this._id;
    }

    public report(subTaskName: string, detailedMessage: string): void {
        this.subTaskName = subTaskName;
        this.detailedMessage = detailedMessage || subTaskName || "Building...";
        this._progressEventEmitter.fire(undefined);
        if (this._statusBarItem) {
            this._statusBarItem.text = subTaskName ? `$(sync~spin) Building - ${subTaskName}...` : "$(sync~spin) Building...";
            this._statusBarItem.show();
        } else {
            this.showProgressNotification();
        }
    }

    public cancel() {
        this._tokenSource.cancel();
        this._cancelEventEmitter.fire(undefined);
        this._statusBarItem?.hide();
        this._disposables.forEach((disposable) => disposable.dispose());
        progressReporterManager.remove(this);
    }

    public isCancelled(): boolean {
        return this.getCancellationToken().isCancellationRequested;
    }

    public getCancellationToken(): CancellationToken {
        return this._tokenSource.token;
    }

    public observe(token?: CancellationToken): void {
        token?.onCancellationRequested(() => {
            this.cancel();
        });
    }

    public showProgressNotification() {
        if (this._isProgressNotificationRunning) {
            return;
        }

        this._isProgressNotificationRunning = true;
        window.withProgress<boolean>({
            location: ProgressLocation.Notification,
            title: `[${this.jobName}](command:java.show.server.task.status)`,
            cancellable: true,
        }, (progress, token) => {
            progress.report({
                message: this.detailedMessage,
            });
            this._progressEventEmitter.event(() => {
                progress.report({
                    message: this.detailedMessage,
                });
            });
            this.observe(token);
            return new Promise((resolve) => {
                this._cancelEventEmitter.event(() => {
                    resolve(true);
                });
            });
        });
    }
}

class JavaProgressReporterManager implements IProgressReporterManager {
    private store: { [key: string]: IProgressReporter } = {};

    public create(jobName: string, showInStatusBar?: boolean): IProgressReporter {
        const progressReporter = new JavaProgressReporter(jobName, showInStatusBar);
        this.store[progressReporter.getId()] = progressReporter;
        return progressReporter;
    }

    public get(progressId: string): IProgressReporter | undefined {
        return this.store[progressId];
    }

    public remove(progressReporter: IProgressReporter) {
        delete this.store[progressReporter.getId()];
    }
}

export const progressReporterManager: IProgressReporterManager = new JavaProgressReporterManager();
