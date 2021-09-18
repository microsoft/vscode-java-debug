// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { v4 } from "uuid";
import { CancellationToken, CancellationTokenSource, Disposable, EventEmitter, ProgressLocation,
    StatusBarAlignment, StatusBarItem, window, workspace } from "vscode";
import { IProgressProvider, IProgressReporter } from "./progressAPI";

const STATUS_COMMAND: string = "java.show.server.task.status";
class ProgressReporter implements IProgressReporter {
    private _id: string = v4();
    private _jobName: string;
    private _progressLocation: ProgressLocation | { viewId: string };
    private _cancellable: boolean = false;

    private _message: string;
    private _increment: number | undefined;
    private _isShown: boolean;

    private _tokenSource = new CancellationTokenSource();
    private _statusBarItem: StatusBarItem | undefined;
    private _cancelProgressEventEmitter: EventEmitter<void>;
    private _progressEventEmitter: EventEmitter<void>;
    private _disposables: Disposable[] = [];

    constructor(jobName: string, progressLocation: ProgressLocation | { viewId: string }, cancellable: boolean) {
        this._jobName = jobName;
        this._progressLocation = progressLocation || ProgressLocation.Notification;
        this._cancellable = cancellable;
        const config = workspace.getConfiguration("java");
        if (config.silentNotification && this._progressLocation === ProgressLocation.Notification) {
            this._progressLocation = ProgressLocation.Window;
        }

        if (this._progressLocation === ProgressLocation.Window) {
            this._statusBarItem = window.createStatusBarItem(this._id, StatusBarAlignment.Left, 1);
            this._statusBarItem.name = "Progress Message for " + this._jobName;
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

    public getProgressLocation(): ProgressLocation | { viewId: string } {
        return this._progressLocation;
    }

    public report(message: string, increment?: number): void {
        if (this._statusBarItem) {
            const text = message ? `${this._jobName} - ${message}` : `${this._jobName}...`;
            this._statusBarItem.text = `$(sync~spin) ${text}`;
        }

        this._message = message;
        this._increment = increment;
        this._progressEventEmitter.fire();
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
            this._cancelProgressEventEmitter.fire();
            this._isShown = false;
        }
    }

    public isCancelled(): boolean {
        return this.getCancellationToken().isCancellationRequested;
    }

    public done(): void {
        this._tokenSource.cancel();
        this._cancelProgressEventEmitter.fire();
        this._statusBarItem?.hide();
        this._disposables.forEach((disposable) => disposable.dispose());
        (<ProgressProvider> progressProvider).remove(this);
    }

    public getCancellationToken(): CancellationToken {
        return this._tokenSource.token;
    }

    public observe(token?: CancellationToken): void {
        token?.onCancellationRequested(() => {
            this.done();
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
            progress.report({
                message: this._message,
                increment: this._increment,
            });
            this.observe(token);
            this._progressEventEmitter.event(() => {
                progress.report({
                    message: this._message,
                    increment: this._increment,
                });
            });
            return new Promise((resolve) => {
                this._cancelProgressEventEmitter.event(() => {
                    resolve(true);
                });
            });
        });
    }
}

class ProgressProvider implements IProgressProvider {
    private store: { [key: string]: IProgressReporter } = {};

    public createProgressReporter(jobName: string, progressLocation?: ProgressLocation | { viewId: string },
                                  cancellable?: boolean): IProgressReporter {
        const progressReporter = new ProgressReporter(jobName, progressLocation || ProgressLocation.Notification,
                                cancellable === undefined ? true : !!cancellable);
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

export const progressProvider: IProgressProvider = new ProgressProvider();
