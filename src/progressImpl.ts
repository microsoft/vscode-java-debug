// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { v4 } from "uuid";
import { CancellationToken, CancellationTokenSource, Disposable, EventEmitter, Progress, ProgressLocation,
    StatusBarAlignment, StatusBarItem, window, workspace } from "vscode";
import { IProgressReporter, IProgressReporterProvider } from "./progressAPI";

const STATUS_COMMAND: string = "java.show.server.task.status";
class ProgressReporter implements IProgressReporter {
    private _id: string = v4();
    private _jobName: string;
    private _progressLocation: ProgressLocation | { viewId: string };
    private _cancellable: boolean = false;

    private _subTaskName: string;
    private _detailedMessage: string;
    private _isShown: boolean;

    private _tokenSource = new CancellationTokenSource();
    private _statusBarItem: StatusBarItem | undefined;
    private _cancelProgressEventEmitter: EventEmitter<any>;
    private _progressEventEmitter: EventEmitter<any>;
    private _disposables: Disposable[] = [];

    constructor(jobName: string, progressLocation: ProgressLocation | { viewId: string }, cancellable?: boolean) {
        this._jobName = jobName;
        this._progressLocation = progressLocation || ProgressLocation.Notification;
        this._cancellable = !!cancellable;
        const config = workspace.getConfiguration("java");
        if (config.silentNotification && this._progressLocation === ProgressLocation.Notification) {
            this._progressLocation = ProgressLocation.Window;
        }

        if (this._progressLocation === ProgressLocation.Window) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 1);
            this._statusBarItem.text = `$(sync~spin) ${this._jobName}...`;
            this._statusBarItem.command = {
                title: "Check Java Build Status",
                command: STATUS_COMMAND,
                arguments: [],
            };
            this._statusBarItem.tooltip = "Check Java Build Status";
            this._disposables.push(this._statusBarItem);
        }

        this._cancelProgressEventEmitter = new EventEmitter<any>();
        this._progressEventEmitter = new EventEmitter<any>();
        this._disposables.push(this._cancelProgressEventEmitter);
        this._disposables.push(this._progressEventEmitter);
        this._disposables.push(this._tokenSource);
    }

    public getId(): string {
        return this._id;
    }

    public report(subTaskName: string, detailedMessage: string): void {
        this._subTaskName = subTaskName;
        this._detailedMessage = detailedMessage || subTaskName || this._jobName;
        this._progressEventEmitter.fire(undefined);
        if (this._statusBarItem) {
            this._statusBarItem.text = `$(sync~spin) ${this._subTaskName || this._jobName}...`;
        }

        this.show();
    }

    public show(): void {
        if (this._statusBarItem) {
            this._statusBarItem.show();
            return;
        }

        this.showNativeProgress();
    }

    public hide(onlyNotifications?: boolean): void {
        if (onlyNotifications && this._progressLocation === ProgressLocation.Notification) {
            this._cancelProgressEventEmitter.fire(undefined);
            this._isShown = false;
        }
    }

    public cancel() {
        this._tokenSource.cancel();
        this._cancelProgressEventEmitter.fire(undefined);
        this._statusBarItem?.hide();
        this._disposables.forEach((disposable) => disposable.dispose());
        (<ProgressReporterProvider> progressProvider).remove(this);
    }

    public isCancelled(): boolean {
        return this.getCancellationToken().isCancellationRequested;
    }

    public done(): void {
        this.cancel();
    }

    public getCancellationToken(): CancellationToken {
        return this._tokenSource.token;
    }

    public observe(token?: CancellationToken): void {
        token?.onCancellationRequested(() => {
            this.cancel();
        });
    }

    private showNativeProgress() {
        if (this._isShown) {
            return;
        }

        this._isShown = true;
        window.withProgress<boolean>({
            location: this._progressLocation,
            title: this._jobName ? `[${this._jobName}](command:${STATUS_COMMAND})` : undefined,
            cancellable: this._cancellable,
        }, (progress, token) => {
            this.reportMessage(progress);
            this.observe(token);
            this._progressEventEmitter.event(() => {
                this.reportMessage(progress);
            });
            return new Promise((resolve) => {
                this._cancelProgressEventEmitter.event(() => {
                    resolve(true);
                });
            });
        });
    }

    private reportMessage(progress: Progress<{ message?: string; increment?: number }>): void {
        const message: string = this._progressLocation === ProgressLocation.Notification ? this._detailedMessage : this._subTaskName;
        progress.report({
            message,
        });
    }
}

class PreLaunchTaskProgressReporter extends ProgressReporter implements IProgressReporter {
    constructor(jobName: string) {
        super(jobName, ProgressLocation.Notification, true);
    }

    public report(subTaskName: string, detailedMessage: string): void {
        super.report("Building - " + subTaskName, detailedMessage);
    }
}

class ProgressReporterProvider implements IProgressReporterProvider {
    private store: { [key: string]: IProgressReporter } = {};

    public createProgressReporter(jobName: string, progressLocation: ProgressLocation, cancellable?: boolean): IProgressReporter {
        const progressReporter = new ProgressReporter(jobName, progressLocation, cancellable);
        this.store[progressReporter.getId()] = progressReporter;
        return progressReporter;
    }

    public createProgressReporterForPreLaunchTask(jobName: string): IProgressReporter {
        const progressReporter = new PreLaunchTaskProgressReporter(jobName);
        this.store[progressReporter.getId()] = progressReporter;
        return progressReporter;
    }

    public getProgressReporter(progressId: string): IProgressReporter | undefined {
        return this.store[progressId];
    }

    public remove(progressReporter: IProgressReporter) {
        delete this.store[progressReporter.getId()];
    }
}

export const progressProvider: IProgressReporterProvider = new ProgressReporterProvider();
