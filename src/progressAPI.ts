// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationToken } from "vscode";

export interface IProgressReporter {
    /**
     * Returns the id of the progress reporter.
     */
    getId(): string;

    /**
     * Update the progress message.
     * @param subTaskName the sub task name to update
     * @param detailedMessage the detailed message to update
     */
    report(subTaskName: string, detailedMessage: string): void;

    /**
     * Cancel the progress reporter.
     */
    cancel(): void;

    /**
     * Is the progress reporter cancelled.
     */
    isCancelled(): boolean;

    /**
     * The CancellationToken to monitor if the progress reporter has been cancelled by the user.
     */
    getCancellationToken(): CancellationToken;

    /**
     * Dispose the progress reporter if the observed token has been cancelled.
     * @param token the cancellation token to observe
     */
    observe(token?: CancellationToken): void;
}

export interface IProgressReporterManager {
    /**
     * Create a progress reporter.
     * @param jobName the job name
     * @param showInStatusBar whether to show the progress in the status bar
     */
    create(jobName: string, showInStatusBar?: boolean): IProgressReporter;

    /**
     * Return the progress repoter with the progress id.
     * @param progressId the progress id
     */
    get(progressId: string): IProgressReporter | undefined;

    /**
     * Remove the progress reporter from the progress reporter manager.
     * @param progressReporter the progress reporter to remove
     */
    remove(progressReporter: IProgressReporter): void;
}
