// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken, ProgressLocation } from "vscode";

export interface IProgressReporter {
    /**
     * Returns the id of the progress reporter.
     */
    getId(): string;

    /**
     * Returns the progress location.
     */
    getProgressLocation(): ProgressLocation | { viewId: string };

    /**
     * Reports a progress message update.
     * @param message the message to update
     * @param increment use `increment` to report discrete progress. Each call with a `increment`
     *                  value will be summed up and reflected as overall progress until 100% is reached.
     *                  Note that currently only `ProgressLocation.Notification` is capable of showing
     *                  discrete progress.
     */
    report(message: string, increment?: number): void;

    /**
     * Shows the progress reporter.
     */
    show(): void;

    /**
     * Hides the progress reporter.
     * @param onlyNotifications only hide the progress reporter when it's shown as notification.
     */
    hide(onlyNotifications?: boolean): void;

    /**
     * Returns whether the progress reporter has been cancelled or completed.
     */
    isCancelled(): boolean;

    /**
     * Notifies the work is done that is either the task is completed or the user has cancelled it.
     */
    done(): void;

    /**
     * The CancellationToken to monitor if the progress reporter has been cancelled by the user.
     */
    getCancellationToken(): CancellationToken;

    /**
     * Disposes the progress reporter if the observed token has been cancelled.
     * @param token the cancellation token to observe
     */
    observe(token?: CancellationToken): void;
}

export interface IProgressProvider {
    /**
     * Creates a progress reporter.
     * @param jobName the job name
     * @param progressLocation The location at which progress should show, defaults to `ProgressLocation.Notification`.
     * @param cancellable Controls if a cancel button should show to allow the user to cancel the progress reporter,
     *                    defaults to true. Note that currently only `ProgressLocation.Notification` is supporting
     *                    to show a cancel button.
     */
    createProgressReporter(jobName: string, progressLocation?: ProgressLocation | { viewId: string }, cancellable?: boolean): IProgressReporter;

    /**
     * Returns the progress reporter with the progress id.
     * @param progressId the progress id
     */
    getProgressReporter(progressId: string): IProgressReporter | undefined;
}
