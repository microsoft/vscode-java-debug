import * as vscode from "vscode";

export function registerBreakpointCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('java.debug.breakpoints.exceptionTypes', exceptionTypes));
}

async function exceptionTypes() {
    const config = vscode.workspace.getConfiguration('java.debug.settings.exceptionBreakpoint');
    let currentTypes = config.get<string[]>('exceptionTypes', []);
    const addExceptionTypeItem: vscode.QuickPickItem = {
        label: '$(add) Add Exception Types...',
        alwaysShow: true,
    };
    const removeExceptionTypeItem: any = (type: string): any => ({
        label: type,
        buttons: [{
            iconPath: new vscode.ThemeIcon('close'),
            tooltip: 'Remove this Exception Type'
        }]
    });

    // Step 1: Show Breakpoint Exception Types
    const pickStep = async (state: any) => {
        return new Promise<any>((resolve) => {
            const items: vscode.QuickPickItem[] = [
                addExceptionTypeItem,
                ...currentTypes.map(type => removeExceptionTypeItem(type))
            ];
            const quickPick = vscode.window.createQuickPick();
            quickPick.items = items;
            quickPick.title = 'Breakpoint Exception Types';
            quickPick.canSelectMany = false;
            quickPick.matchOnDescription = false;
            quickPick.matchOnDetail = false;

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected.label.includes('Add Exception Types')) {
                    quickPick.hide();
                    // go to next step
                    resolve(state);
                }
            });

            quickPick.onDidTriggerItemButton(async (e) => {
                const typeToRemove = e.item.label;
                currentTypes = currentTypes.filter(type => type !== typeToRemove);
                await config.update('exceptionTypes', currentTypes, vscode.ConfigurationTarget.Global);
                quickPick.items = [
                    addExceptionTypeItem,
                    ...currentTypes.map(type => removeExceptionTypeItem(type))
                ];
            });
            quickPick.onDidHide(() => {
                quickPick.dispose();
            });
            quickPick.show();
        });
    };

    // Step 2: Add Exception Type(s)
    const inputStep = async (state: any) => {
        return new Promise<any>((resolve, reject) => {
            const input = vscode.window.createInputBox();
            input.title = 'Add Breakpoint Exception Type(s)';
            input.placeholder = 'Enter exception type(s) (comma or space separated). "java.lang.NullPointerException" e.g.';
            input.prompt = 'Input exception types';
            input.buttons = [vscode.QuickInputButtons.Back];
            input.onDidAccept(async () => {
                const exceptionType = input.value;
                if (exceptionType) {
                    const types = exceptionType.split(/[,\s]+/).map(type => type.trim()).filter(type => type.length > 0);
                    let updated = false;
                    for (const type of types) {
                        if (!currentTypes.includes(type)) {
                            currentTypes.push(type);
                            updated = true;
                        }
                    }
                    if (updated) {
                        await config.update('exceptionTypes', currentTypes, vscode.ConfigurationTarget.Global);
                    }
                }
                input.hide();
                // go back to pick step
                resolve(state);
            });
            input.onDidTriggerButton((btn) => {
                if (btn === vscode.QuickInputButtons.Back) {
                    input.hide();
                    reject({ stepBack: true });
                }
            });
            input.onDidHide(() => {
                input.dispose();
            });
            input.show();
        });
    };

    while (true) {
        await multiStepInput([pickStep, inputStep], {});
    }
}

async function multiStepInput<T>(steps: ((input: T) => Promise<T>)[], initial: T): Promise<T> {
    let state = initial;
    let currentStep = 0;
    while (currentStep < steps.length) {
        try {
            state = await steps[currentStep](state);
            currentStep++;
        } catch (err) {
            if (err?.stepBack) {
                if (currentStep > 0) {
                    currentStep--;
                }
            } else {
                throw err;
            }
        }
    }
    return state;
}
