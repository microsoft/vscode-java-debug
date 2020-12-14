// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken, ProgressLocation } from "vscode";

export interface IProgressReporter {
    /**
     * Returns the id of the progress reporter.
     */
    getId(): string;

    /**
     * Reports a progress message update.
     * @param subTaskName the message shown in the status bar
     * @param detailedMessage the detailed message shown in the notification
     */
    report(subTaskName: string, detailedMessage: string): void;

    /**
     * Shows the progress reporter.
     */
    show(): void;

    /**
     * Hides the progress reporter.
     * @param onlyNotifications only hide the progress reporter when it's shown as notification
     */
    hide(onlyNotifications?: boolean): void;

    /**
     * Cancels the progress reporter.
     */
    cancel(): void;

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

export interface IProgressReporterProvider {
    /**
     * Creates a progress reporter.
     * @param jobName the job name
     * @param progressLocation The location at which progress should show
     * @param cancellable Controls if a cancel button should show to allow the user
     *                    to cancel the progress reporter. Note that currently only
     *                    `ProgressLocation.Notification` is supporting to show a cancel
     *                    button.
     */
    createProgressReporter(jobName: string, progressLocation: ProgressLocation | { viewId: string }, cancellable?: boolean): IProgressReporter;

    /**
     * Creates a progress reporter for the task to run before the debug session starts.
     * @param jobName the job name
     */
    createProgressReporterForPreLaunchTask(jobName: string): IProgressReporter;

    /**
     * Returns the progress reporter with the progress id.
     * @param progressId the progress id
     */
    getProgressReporter(progressId: string): IProgressReporter | undefined;
}
