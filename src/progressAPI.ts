// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken, ProgressLocation } from "vscode";

/* tslint:disable */
export interface IProgressReporter {
    /**
     * Returns the id of the progress reporter.
     */
    getId(): string;

    /**
     * Reports a progress message update.
     * @param subTaskName the sub task name that's running
     * @param detailedMessage a more detailed message to be shown in progress notifications
     */
    report(subTaskName: string, detailedMessage?: string): void;

    /**
     * Reports a progress message update.
     * @param subTaskName the sub task name that's running
     * @param increment use `increment` to report discrete progress. Each call with a `increment`
     *                  value will be summed up and reflected as overall progress until 100% is reached.
     */
    report(subTaskName: string, increment?: number): void;

    /**
     * Reports a progress message update.
     * @param subTaskName the sub task name that's running
     * @param detailedMessage a more detailed message to be shown in progress notifications
     * @param increment use `increment` to report discrete progress. Each call with a `increment`
     *                  value will be summed up and reflected as overall progress until 100% is reached.
     */
    report(subTaskName: string, detailedMessage: string, increment?: number): void;

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
     * @param progressLocation The location at which progress should show
     * @param cancellable Controls if a cancel button should show to allow the user
     *                    to cancel the progress reporter. Note that currently only
     *                    `ProgressLocation.Notification` is supporting to show a cancel
     *                    button.
     */
    createProgressReporter(jobName: string, progressLocation: ProgressLocation | { viewId: string }, cancellable?: boolean): IProgressReporter;

    /**
     * Creates a progress reporter for the preLaunch task that runs before the debug session starts.
     * For example, building the workspace and calculating the launch configuration are the typical
     * preLaunch tasks.
     * @param jobName the job name
     */
    createProgressReporterForPreLaunchTask(jobName: string): IProgressReporter;

    /**
     * Returns the progress reporter with the progress id.
     * @param progressId the progress id
     */
    getProgressReporter(progressId: string): IProgressReporter | undefined;
}
