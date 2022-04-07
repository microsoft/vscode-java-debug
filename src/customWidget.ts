// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export class NotificationBar implements vscode.Disposable {
    private statusBar: vscode.StatusBarItem;
    private lastUpdateTime: number;

    constructor(id: string, name: string) {
        this.statusBar = vscode.window.createStatusBarItem(id, vscode.StatusBarAlignment.Left, 1);
        this.statusBar.name = name;
    }

    public show(text: string, duration?: number) {
        this.statusBar.text = text;
        this.statusBar.show();
        const updateTime = Date.now();
        this.lastUpdateTime = updateTime;
        if (duration) {
            setTimeout(() => {
                if (this.lastUpdateTime === updateTime) {
                    this.statusBar.text = "";
                    this.statusBar.hide();
                }
            }, duration);
        }
    }

    public clear() {
        this.statusBar.text = "";
        this.statusBar.hide();
    }

    public dispose() {
        this.statusBar.dispose();
    }
}
