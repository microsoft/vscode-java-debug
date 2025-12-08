// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { sendError, sendInfo } from "vscode-extension-telemetry-wrapper";

interface DebugJavaApplicationInput {
    target: string;
    workspacePath: string;
    args?: string[];
    skipBuild?: boolean;
    classpath?: string;
    waitForSession?: boolean;
}

interface DebugJavaApplicationResult {
    success: boolean;
    message: string;
    terminalName?: string;
    status?: 'started' | 'timeout' | 'sent';  // More specific status
    sessionId?: string;  // Session ID if detected
}

// Type definitions for Language Model API (these will be in future VS Code versions)
// For now, we use 'any' to allow compilation with older VS Code types
interface LanguageModelTool<T = any> {
    invoke(options: { input: T }, token: vscode.CancellationToken): Promise<any>;
}

/**
 * Registers the Language Model Tool for debugging Java applications.
 * This allows AI assistants to help users debug Java code by invoking the debugjava command.
 */
export function registerLanguageModelTool(context: vscode.ExtensionContext): vscode.Disposable | undefined {
    // Check if the Language Model API is available
    const lmApi = (vscode as any).lm;
    if (!lmApi || typeof lmApi.registerTool !== 'function') {
        // Language Model API not available in this VS Code version
        return undefined;
    }

    const tool: LanguageModelTool<DebugJavaApplicationInput> = {
        async invoke(options: { input: DebugJavaApplicationInput }, token: vscode.CancellationToken): Promise<any> {
            sendInfo('', {
                operationName: 'languageModelTool.debugJavaApplication.invoke',
                target: options.input.target,
                skipBuild: options.input.skipBuild?.toString() || 'false',
            });

            try {
                const result = await debugJavaApplication(options.input, token);
                
                // Format the message for AI - use simple text, not JSON
                const message = result.success 
                    ? `✓ ${result.message}`
                    : `✗ ${result.message}`;
                
                // Return result in the expected format - simple text part
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(message)
                ]);
            } catch (error) {
                sendError(error as Error);
                
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Debug failed: ${errorMessage}`)
                ]);
            }
        }
    };

    const disposable = lmApi.registerTool('debug_java_application', tool);
    context.subscriptions.push(disposable);
    return disposable;
}

/**
 * Main function to debug a Java application.
 * This function handles:
 * 1. Project type detection
 * 2. Building the project if needed
 * 3. Executing the debugjava command
 */
async function debugJavaApplication(
    input: DebugJavaApplicationInput,
    token: vscode.CancellationToken
): Promise<DebugJavaApplicationResult> {
    if (token.isCancellationRequested) {
        return {
            success: false,
            message: 'Operation cancelled by user'
        };
    }

    // Validate workspace path
    const workspaceUri = vscode.Uri.file(input.workspacePath);
    if (!fs.existsSync(input.workspacePath)) {
        return {
            success: false,
            message: `Workspace path does not exist: ${input.workspacePath}`
        };
    }

    // Step 1: Detect project type
    const projectType = detectProjectType(input.workspacePath);

    // Step 2: Build the project if needed
    if (!input.skipBuild) {
        const buildResult = await buildProject(workspaceUri, projectType, token);
        if (!buildResult.success) {
            return buildResult;
        }
    }

    // Step 3: Construct and execute the debugjava command
    const debugCommand = constructDebugCommand(input, projectType);
    
    // Validate that we can construct a valid command
    if (!debugCommand || debugCommand === 'debugjava') {
        return {
            success: false,
            message: 'Failed to construct debug command. Please check the target parameter.'
        };
    }
    
    // Step 4: Execute in terminal and optionally wait for debug session
    const terminal = vscode.window.createTerminal({
        name: 'Java Debug',
        cwd: input.workspacePath,
        hideFromUser: false,
        isTransient: false  // Keep terminal alive even after process exits
    });
    
    terminal.show();

    // Build info message for AI
    let targetInfo = input.target;
    let warningNote = '';
    
    if (input.target.endsWith('.jar')) {
        targetInfo = input.target;
    } else if (input.target.includes('.')) {
        targetInfo = input.target;
    } else {
        // Simple class name - check if we successfully detected the full name
        const detectedClassName = findFullyQualifiedClassName(input.workspacePath, input.target, projectType);
        if (detectedClassName) {
            targetInfo = `${detectedClassName} (detected from ${input.target})`;
        } else {
            targetInfo = input.target;
            warningNote = ' ⚠️ Note: Could not auto-detect package name. If you see "ClassNotFoundException", please provide the fully qualified class name (e.g., "com.example.App" instead of "App").';
        }
    }
    
    // If waitForSession is true, wait for the debug session to start
    if (input.waitForSession) {
        return new Promise<DebugJavaApplicationResult>((resolve) => {
            let sessionStarted = false;
            
            // Listen for debug session start
            const sessionDisposable = vscode.debug.onDidStartDebugSession((session) => {
                if (session.type === 'java' && !sessionStarted) {
                    sessionStarted = true;
                    sessionDisposable.dispose();
                    timeoutHandle && clearTimeout(timeoutHandle);
                    
                    sendInfo('', {
                        operationName: 'languageModelTool.debugSessionStarted.eventBased',
                        sessionId: session.id,
                        sessionName: session.name
                    });
                    
                    resolve({
                        success: true,
                        status: 'started',
                        sessionId: session.id,
                        message: `✓ Debug session started for ${targetInfo}. Session ID: ${session.id}. The debugger is now attached and ready. Any breakpoints you set will be active.${warningNote}`,
                        terminalName: terminal.name
                    });
                }
            });
            
            // Send the command after setting up the listener
            terminal.sendText(debugCommand);
            
            // Set a timeout (45 seconds) for large applications
            const timeoutHandle = setTimeout(() => {
                if (!sessionStarted) {
                    sessionDisposable.dispose();
                    
                    sendInfo('', {
                        operationName: 'languageModelTool.debugSessionTimeout.eventBased',
                        target: targetInfo
                    });
                    
                    resolve({
                        success: false,
                        status: 'timeout',
                        message: `❌ Debug session failed to start within 45 seconds for ${targetInfo}.\n\n` +
                                 `This usually indicates a problem:\n` +
                                 `• Compilation errors preventing startup\n` +
                                 `• ClassNotFoundException or NoClassDefFoundError\n` +
                                 `• Application crashed during initialization\n` +
                                 `• Incorrect main class or classpath configuration\n\n` +
                                 `Action required:\n` +
                                 `1. Check terminal '${terminal.name}' for error messages\n` +
                                 `2. Verify the target class name is correct\n` +
                                 `3. Ensure the project is compiled successfully\n` +
                                 `4. Use get_debug_session_info() to confirm session status${warningNote}`,
                        terminalName: terminal.name
                    });
                }
            }, 45000);
        });
    } else {
        // Default behavior: send command and use smart polling to detect session start
        terminal.sendText(debugCommand);
        
        // Smart polling: check every 300ms for up to 15 seconds
        const maxWaitTime = 15000;  // 15 seconds max
        const pollInterval = 300;   // Check every 300ms
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            // Check if debug session has started
            const session = vscode.debug.activeDebugSession;
            if (session && session.type === 'java') {
                const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
                
                sendInfo('', {
                    operationName: 'languageModelTool.debugSessionDetected',
                    sessionId: session.id,
                    elapsedTime: elapsedTime
                });
                
                return {
                    success: true,
                    status: 'started',
                    sessionId: session.id,
                    message: `✓ Debug session started for ${targetInfo} (detected in ${elapsedTime}s). Session ID: ${session.id}. The debugger is attached and ready.${warningNote}`,
                    terminalName: terminal.name
                };
            }
            
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        
        // Timeout: session not detected within 15 seconds
        sendInfo('', {
            operationName: 'languageModelTool.debugSessionTimeout.smartPolling',
            target: targetInfo,
            maxWaitTime: maxWaitTime
        });
        
        return {
            success: true,
            status: 'timeout',
            message: `⚠️ Debug command sent for ${targetInfo}, but session not detected within 15 seconds.\n\n` +
                     `Possible reasons:\n` +
                     `• Application is still starting (large projects may take longer)\n` +
                     `• Compilation errors (check terminal '${terminal.name}' for errors)\n` +
                     `• Application may have started and already terminated\n\n` +
                     `Next steps:\n` +
                     `• Use get_debug_session_info() to check if session is now active\n` +
                     `• Check terminal '${terminal.name}' for error messages\n` +
                     `• If starting slowly, wait 10-15 more seconds and check again${warningNote}`,
            terminalName: terminal.name
        };
    }
}

/**
 * Detects the type of Java project based on build files present.
 */
function detectProjectType(workspacePath: string): 'maven' | 'gradle' | 'vscode' | 'unknown' {
    if (fs.existsSync(path.join(workspacePath, 'pom.xml'))) {
        return 'maven';
    }
    
    if (fs.existsSync(path.join(workspacePath, 'build.gradle')) || 
        fs.existsSync(path.join(workspacePath, 'build.gradle.kts'))) {
        return 'gradle';
    }
    
    // Check if VS Code Java extension is likely managing compilation
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(workspacePath));
    if (workspaceFolder) {
        const javaExt = vscode.extensions.getExtension('redhat.java');
        if (javaExt?.isActive) {
            return 'vscode';
        }
    }
    
    return 'unknown';
}

/**
 * Builds the Java project based on its type.
 */
async function buildProject(
    workspaceUri: vscode.Uri,
    projectType: 'maven' | 'gradle' | 'vscode' | 'unknown',
    _token: vscode.CancellationToken
): Promise<DebugJavaApplicationResult> {
    switch (projectType) {
        case 'maven':
            return await buildMavenProject(workspaceUri);
        
        case 'gradle':
            return await buildGradleProject(workspaceUri);
        
        case 'vscode':
            return await ensureVSCodeCompilation(workspaceUri);
        
        case 'unknown':
            // Try to proceed anyway - user might have manually compiled
            return {
                success: true,
                message: 'Unknown project type. Skipping build step. Ensure your Java files are compiled.'
            };
    }
}

/**
 * Builds a Maven project using mvn compile.
 */
async function buildMavenProject(
    workspaceUri: vscode.Uri
): Promise<DebugJavaApplicationResult> {
    return new Promise((resolve) => {
        // Use task API for better control
        const task = new vscode.Task(
            { type: 'shell', task: 'maven-compile' },
            vscode.workspace.getWorkspaceFolder(workspaceUri)!,
            'Maven Compile',
            'Java Debug',
            new vscode.ShellExecution('mvn compile', { cwd: workspaceUri.fsPath })
        );

        // Set a timeout to avoid hanging indefinitely
        const timeout = setTimeout(() => {
            resolve({
                success: true,
                message: 'Maven compile command sent. Build may still be in progress.'
            });
        }, 60000); // 60 second timeout

        vscode.tasks.executeTask(task).then((execution) => {
            let resolved = false;
            
            const disposable = vscode.tasks.onDidEndTask((e) => {
                if (e.execution === execution && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    disposable.dispose();
                    resolve({
                        success: true,
                        message: 'Maven project compiled successfully'
                    });
                }
            });

            const errorDisposable = vscode.tasks.onDidEndTaskProcess((e) => {
                if (e.execution === execution && e.exitCode !== 0 && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    errorDisposable.dispose();
                    resolve({
                        success: false,
                        message: `Maven build failed with exit code ${e.exitCode}. Please check the terminal output.`
                    });
                }
            });
        });
    });
}

/**
 * Builds a Gradle project using gradle classes.
 */
async function buildGradleProject(
    workspaceUri: vscode.Uri
): Promise<DebugJavaApplicationResult> {
    return new Promise((resolve) => {
        const gradleWrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
        const gradleCommand = fs.existsSync(path.join(workspaceUri.fsPath, gradleWrapper)) 
            ? gradleWrapper 
            : 'gradle';

        const task = new vscode.Task(
            { type: 'shell', task: 'gradle-classes' },
            vscode.workspace.getWorkspaceFolder(workspaceUri)!,
            'Gradle Classes',
            'Java Debug',
            new vscode.ShellExecution(`${gradleCommand} classes`, { cwd: workspaceUri.fsPath })
        );

        // Set a timeout to avoid hanging indefinitely
        const timeout = setTimeout(() => {
            resolve({
                success: true,
                message: 'Gradle compile command sent. Build may still be in progress.'
            });
        }, 60000); // 60 second timeout

        vscode.tasks.executeTask(task).then((execution) => {
            let resolved = false;
            
            const disposable = vscode.tasks.onDidEndTask((e) => {
                if (e.execution === execution && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    disposable.dispose();
                    resolve({
                        success: true,
                        message: 'Gradle project compiled successfully'
                    });
                }
            });

            const errorDisposable = vscode.tasks.onDidEndTaskProcess((e) => {
                if (e.execution === execution && e.exitCode !== 0 && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    errorDisposable.dispose();
                    resolve({
                        success: false,
                        message: `Gradle build failed with exit code ${e.exitCode}. Please check the terminal output.`
                    });
                }
            });
        });
    });
}

/**
 * Ensures VS Code Java Language Server has compiled the files.
 */
async function ensureVSCodeCompilation(workspaceUri: vscode.Uri): Promise<DebugJavaApplicationResult> {
    try {
        // Check for compilation errors using VS Code diagnostics
        const javaFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceUri, '**/*.java'),
            '**/node_modules/**',
            100 // Limit to 100 files for performance
        );

        let hasErrors = false;
        for (const file of javaFiles) {
            const diagnostics = vscode.languages.getDiagnostics(file);
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            if (errors.length > 0) {
                hasErrors = true;
                break;
            }
        }

        if (hasErrors) {
            return {
                success: false,
                message: 'Compilation errors detected in the project. Please fix the errors before debugging.'
            };
        }

        // Check if Java extension is active and in standard mode
        const javaExt = vscode.extensions.getExtension('redhat.java');
        if (!javaExt?.isActive) {
            return {
                success: true,
                message: 'Java Language Server is not active. Proceeding with debug, but ensure your code is compiled.'
            };
        }

        return {
            success: true,
            message: 'VS Code Java compilation verified'
        };
    } catch (error) {
        // If we can't verify, proceed anyway
        return {
            success: true,
            message: 'Unable to verify compilation status. Proceeding with debug.'
        };
    }
}

/**
 * Constructs the debugjava command based on input parameters.
 */
function constructDebugCommand(
    input: DebugJavaApplicationInput,
    projectType: 'maven' | 'gradle' | 'vscode' | 'unknown'
): string {
    let command = 'debugjava';

    // Handle JAR files
    if (input.target.endsWith('.jar')) {
        command += ` -jar ${input.target}`;
    } 
    // Handle raw java command arguments (starts with - like -cp, -jar, etc)
    else if (input.target.startsWith('-')) {
        command += ` ${input.target}`;
    }
    // Handle class name (with or without package)
    else {
        let className = input.target;
        
        // If target doesn't contain a dot and we can find the Java file, 
        // try to detect the fully qualified class name
        if (!input.target.includes('.')) {
            const detectedClassName = findFullyQualifiedClassName(input.workspacePath, input.target, projectType);
            if (detectedClassName) {
                sendInfo('', {
                    operationName: 'languageModelTool.classNameDetection',
                    simpleClassName: input.target,
                    detectedClassName: detectedClassName,
                    projectType: projectType
                });
                className = detectedClassName;
            } else {
                // No package detected - class is in default package
                sendInfo('', {
                    operationName: 'languageModelTool.classNameDetection.noPackage',
                    simpleClassName: input.target,
                    projectType: projectType
                });
            }
        }
        
        // Use provided classpath if available, otherwise infer it
        const classpath = input.classpath || inferClasspath(input.workspacePath, projectType);
        
        command += ` -cp "${classpath}" ${className}`;
    }

    // Add arguments if provided
    if (input.args && input.args.length > 0) {
        command += ' ' + input.args.join(' ');
    }

    return command;
}

/**
 * Tries to find the fully qualified class name by searching for the Java file.
 * This helps when user provides just "App" instead of "com.example.App".
 */
function findFullyQualifiedClassName(
    workspacePath: string,
    simpleClassName: string,
    projectType: 'maven' | 'gradle' | 'vscode' | 'unknown'
): string | null {
    // Determine source directories based on project type
    const sourceDirs: string[] = [];
    
    switch (projectType) {
        case 'maven':
            sourceDirs.push(path.join(workspacePath, 'src', 'main', 'java'));
            break;
        case 'gradle':
            sourceDirs.push(path.join(workspacePath, 'src', 'main', 'java'));
            break;
        case 'vscode':
            sourceDirs.push(path.join(workspacePath, 'src'));
            break;
        case 'unknown':
            // Try all common locations
            sourceDirs.push(
                path.join(workspacePath, 'src', 'main', 'java'),
                path.join(workspacePath, 'src'),
                workspacePath
            );
            break;
    }

    // Search for the Java file
    for (const srcDir of sourceDirs) {
        if (!fs.existsSync(srcDir)) {
            continue;
        }

        try {
            const javaFile = findJavaFile(srcDir, simpleClassName);
            if (javaFile) {
                // Extract package name from the file
                const packageName = extractPackageName(javaFile);
                if (packageName) {
                    return `${packageName}.${simpleClassName}`;
                } else {
                    // No package, use simple name
                    return simpleClassName;
                }
            }
        } catch (error) {
            // Continue searching in other directories
        }
    }

    return null;
}

/**
 * Recursively searches for a Java file with the given class name.
 */
function findJavaFile(dir: string, className: string): string | null {
    try {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                // Skip common non-source directories
                if (file === 'node_modules' || file === '.git' || file === 'target' || file === 'build') {
                    continue;
                }
                const found = findJavaFile(filePath, className);
                if (found) {
                    return found;
                }
            } else if (file === `${className}.java`) {
                return filePath;
            }
        }
    } catch (error) {
        // Ignore permission errors or other file system issues
    }
    
    return null;
}

/**
 * Extracts the package name from a Java source file.
 */
function extractPackageName(javaFilePath: string): string | null {
    try {
        const content = fs.readFileSync(javaFilePath, 'utf-8');
        const packageMatch = content.match(/^\s*package\s+([\w.]+)\s*;/m);
        return packageMatch ? packageMatch[1] : null;
    } catch (error) {
        return null;
    }
}

/**
 * Checks if a directory contains any .class files.
 */
function hasClassFiles(dir: string): boolean {
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isFile() && file.endsWith('.class')) {
                return true;
            } else if (stat.isDirectory()) {
                // Recursively check subdirectories (but limit depth)
                if (hasClassFiles(filePath)) {
                    return true;
                }
            }
        }
    } catch (error) {
        // Ignore errors
    }
    return false;
}

/**
 * Infers the classpath based on project type and common conventions.
 */
function inferClasspath(workspacePath: string, projectType: 'maven' | 'gradle' | 'vscode' | 'unknown'): string {
    const classpaths: string[] = [];

    switch (projectType) {
        case 'maven':
            // Maven standard output directory
            const mavenTarget = path.join(workspacePath, 'target', 'classes');
            if (fs.existsSync(mavenTarget)) {
                classpaths.push(mavenTarget);
            }
            break;

        case 'gradle':
            // Gradle standard output directories
            const gradleMain = path.join(workspacePath, 'build', 'classes', 'java', 'main');
            if (fs.existsSync(gradleMain)) {
                classpaths.push(gradleMain);
            }
            break;

        case 'vscode':
            // VS Code Java extension default output
            const vscodeOut = path.join(workspacePath, 'bin');
            if (fs.existsSync(vscodeOut)) {
                classpaths.push(vscodeOut);
            }
            break;
    }

    // Fallback to common locations
    if (classpaths.length === 0) {
        const commonPaths = [
            path.join(workspacePath, 'bin'),           // VS Code default
            path.join(workspacePath, 'out'),           // IntelliJ default
            path.join(workspacePath, 'target', 'classes'), // Maven
            path.join(workspacePath, 'build', 'classes', 'java', 'main'), // Gradle
            path.join(workspacePath, 'build', 'classes'),
        ];

        // Check each common path
        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                // Check if there are actually .class files in this directory
                if (hasClassFiles(p)) {
                    classpaths.push(p);
                    break;
                }
            }
        }
    }

    // If still no classpath found, use current directory
    // This is common for simple projects where .class files are alongside .java files
    if (classpaths.length === 0) {
        classpaths.push('.');
    }

    return classpaths.join(path.delimiter);
}

// ============================================================================
// Debug Session Control Tools
// ============================================================================

interface SetBreakpointInput {
    filePath: string;
    lineNumber: number;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
}

interface StepOperationInput {
    operation: 'stepIn' | 'stepOut' | 'stepOver' | 'continue' | 'pause';
    threadId?: number;
}

interface GetVariablesInput {
    frameId?: number;
    scopeType?: 'local' | 'static' | 'all';
    filter?: string;
}

interface GetStackTraceInput {
    threadId?: number;
    maxDepth?: number;
}

interface EvaluateExpressionInput {
    expression: string;
    frameId?: number;
    context?: 'watch' | 'repl' | 'hover';
}

interface RemoveBreakpointsInput {
    filePath?: string;
    lineNumber?: number;
}

interface StopDebugSessionInput {
    reason?: string;
}

interface GetDebugSessionInfoInput {
    // No parameters needed - just returns info about active session
}

/**
 * Registers all debug session control tools
 */
export function registerDebugSessionTools(_context: vscode.ExtensionContext): vscode.Disposable[] {
    const lmApi = (vscode as any).lm;
    if (!lmApi || typeof lmApi.registerTool !== 'function') {
        return [];
    }

    const disposables: vscode.Disposable[] = [];

    // Tool 1: Set Breakpoint
    const setBreakpointTool: LanguageModelTool<SetBreakpointInput> = {
        async invoke(options: { input: SetBreakpointInput }, _token: vscode.CancellationToken): Promise<any> {
            try {
                const { filePath, lineNumber, condition, hitCondition, logMessage } = options.input;
                
                // Set breakpoint through VS Code API (no active session required)
                const uri = vscode.Uri.file(filePath);
                const breakpoint = new vscode.SourceBreakpoint(
                    new vscode.Location(uri, new vscode.Position(lineNumber - 1, 0)),
                    true, // enabled
                    condition,
                    hitCondition,
                    logMessage
                );

                vscode.debug.addBreakpoints([breakpoint]);

                const bpType = logMessage ? 'Logpoint' : 'Breakpoint';
                const session = vscode.debug.activeDebugSession;
                const sessionInfo = (session && session.type === 'java')
                    ? ' (active in current session)'
                    : ' (will activate when debugging starts)';
                
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(
                        `✓ ${bpType} set at ${path.basename(filePath)}:${lineNumber}${condition ? ` (condition: ${condition})` : ''}${sessionInfo}`
                    )
                ]);
            } catch (error) {
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Failed to set breakpoint: ${error}`)
                ]);
            }
        }
    };
    disposables.push(lmApi.registerTool('set_java_breakpoint', setBreakpointTool));

    // Tool 2: Step Operations
    const stepOperationTool: LanguageModelTool<StepOperationInput> = {
        async invoke(options: { input: StepOperationInput }, _token: vscode.CancellationToken): Promise<any> {
            try {
                const session = vscode.debug.activeDebugSession;
                if (!session || session.type !== 'java') {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('✗ No active Java debug session.')
                    ]);
                }

                const { operation, threadId } = options.input;
                
                // Map operation to VS Code debug commands
                const commandMap: { [key: string]: string } = {
                    stepIn: 'workbench.action.debug.stepInto',
                    stepOut: 'workbench.action.debug.stepOut',
                    stepOver: 'workbench.action.debug.stepOver',
                    continue: 'workbench.action.debug.continue',
                    pause: 'workbench.action.debug.pause'
                };

                const command = commandMap[operation];
                if (threadId !== undefined) {
                    // For thread-specific operations, use custom request
                    await session.customRequest(operation, { threadId });
                } else {
                    // Use VS Code command for current thread
                    await vscode.commands.executeCommand(command);
                }

                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✓ Executed ${operation}`)
                ]);
            } catch (error) {
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Step operation failed: ${error}`)
                ]);
            }
        }
    };
    disposables.push(lmApi.registerTool('debug_step_operation', stepOperationTool));

    // Tool 3: Get Variables
    const getVariablesTool: LanguageModelTool<GetVariablesInput> = {
        async invoke(options: { input: GetVariablesInput }, _token: vscode.CancellationToken): Promise<any> {
            try {
                const session = vscode.debug.activeDebugSession;
                if (!session || session.type !== 'java') {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('✗ No active Java debug session.')
                    ]);
                }

                const { frameId = 0, scopeType = 'all', filter } = options.input;

                // Get stack trace to access frame
                const stackResponse = await session.customRequest('stackTrace', {
                    threadId: (session as any).threadId || 1,
                    startFrame: frameId,
                    levels: 1
                });

                if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('✗ No stack frame available.')
                    ]);
                }

                const frame = stackResponse.stackFrames[0];

                // Get scopes for the frame
                const scopesResponse = await session.customRequest('scopes', { frameId: frame.id });
                
                let variables: string[] = [];
                for (const scope of scopesResponse.scopes) {
                    // Filter by scope type
                    if (scopeType === 'local' && scope.name !== 'Local' && scope.name !== 'Locals') continue;
                    if (scopeType === 'static' && scope.name !== 'Static') continue;

                    // Get variables for this scope
                    const varsResponse = await session.customRequest('variables', { 
                        variablesReference: scope.variablesReference 
                    });

                    for (const v of varsResponse.variables) {
                        if (!filter || v.name.includes(filter) || matchWildcard(v.name, filter)) {
                            variables.push(`${v.name}: ${v.type || ''} = ${v.value}`);
                        }
                    }
                }

                if (variables.length === 0) {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('No variables found.')
                    ]);
                }

                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(
                        `Variables (frame ${frameId}):\n${variables.join('\n')}`
                    )
                ]);
            } catch (error) {
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Failed to get variables: ${error}`)
                ]);
            }
        }
    };
    disposables.push(lmApi.registerTool('get_debug_variables', getVariablesTool));

    // Tool 4: Get Stack Trace
    const getStackTraceTool: LanguageModelTool<GetStackTraceInput> = {
        async invoke(options: { input: GetStackTraceInput }, _token: vscode.CancellationToken): Promise<any> {
            try {
                const session = vscode.debug.activeDebugSession;
                if (!session || session.type !== 'java') {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('✗ No active Java debug session.')
                    ]);
                }

                const { threadId, maxDepth = 50 } = options.input;

                const stackResponse = await session.customRequest('stackTrace', {
                    threadId: threadId || (session as any).threadId || 1,
                    startFrame: 0,
                    levels: maxDepth
                });

                if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('No stack frames available.')
                    ]);
                }

                const frames = stackResponse.stackFrames.map((frame: any, index: number) => {
                    const location = frame.source ? 
                        `${frame.source.name}:${frame.line}` : 
                        'unknown location';
                    return `#${index} ${frame.name} at ${location}`;
                });

                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(
                        `Call Stack:\n${frames.join('\n')}`
                    )
                ]);
            } catch (error) {
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Failed to get stack trace: ${error}`)
                ]);
            }
        }
    };
    disposables.push(lmApi.registerTool('get_debug_stack_trace', getStackTraceTool));

    // Tool 5: Evaluate Expression
    const evaluateExpressionTool: LanguageModelTool<EvaluateExpressionInput> = {
        async invoke(options: { input: EvaluateExpressionInput }, _token: vscode.CancellationToken): Promise<any> {
            try {
                const session = vscode.debug.activeDebugSession;
                if (!session || session.type !== 'java') {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('✗ No active Java debug session.')
                    ]);
                }

                const { expression, frameId = 0, context = 'repl' } = options.input;

                const evalResponse = await session.customRequest('evaluate', {
                    expression,
                    frameId,
                    context
                });

                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(
                        `Expression: ${expression}\nResult: ${evalResponse.result}${evalResponse.type ? ` (${evalResponse.type})` : ''}`
                    )
                ]);
            } catch (error) {
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Evaluation failed: ${error}`)
                ]);
            }
        }
    };
    disposables.push(lmApi.registerTool('evaluate_debug_expression', evaluateExpressionTool));

    // Tool 6: Get Threads
    const getThreadsTool: LanguageModelTool<{}> = {
        async invoke(_options: { input: {} }, _token: vscode.CancellationToken): Promise<any> {
            try {
                const session = vscode.debug.activeDebugSession;
                if (!session || session.type !== 'java') {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('✗ No active Java debug session.')
                    ]);
                }

                const threadsResponse = await session.customRequest('threads');

                if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('No threads found.')
                    ]);
                }

                const threads = threadsResponse.threads.map((thread: any) => 
                    `Thread #${thread.id}: ${thread.name}`
                );

                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(
                        `Active Threads:\n${threads.join('\n')}`
                    )
                ]);
            } catch (error) {
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Failed to get threads: ${error}`)
                ]);
            }
        }
    };
    disposables.push(lmApi.registerTool('get_debug_threads', getThreadsTool));

    // Tool 7: Remove Breakpoints
    const removeBreakpointsTool: LanguageModelTool<RemoveBreakpointsInput> = {
        async invoke(options: { input: RemoveBreakpointsInput }, _token: vscode.CancellationToken): Promise<any> {
            try {
                const { filePath, lineNumber } = options.input;

                const breakpoints = vscode.debug.breakpoints;

                if (!filePath) {
                    // Remove all breakpoints (no active session required)
                    const count = breakpoints.length;
                    vscode.debug.removeBreakpoints(breakpoints);
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart(`✓ Removed all ${count} breakpoint(s).`)
                    ]);
                }

                const uri = vscode.Uri.file(filePath);
                const toRemove = breakpoints.filter(bp => {
                    if (bp instanceof vscode.SourceBreakpoint) {
                        const match = bp.location.uri.fsPath === uri.fsPath;
                        if (lineNumber !== undefined) {
                            return match && bp.location.range.start.line === lineNumber - 1;
                        }
                        return match;
                    }
                    return false;
                });

                if (toRemove.length > 0) {
                    vscode.debug.removeBreakpoints(toRemove);
                }

                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(
                        toRemove.length > 0 
                            ? `✓ Removed ${toRemove.length} breakpoint(s) from ${path.basename(filePath)}${lineNumber ? `:${lineNumber}` : ''}`
                            : 'No matching breakpoints found.'
                    )
                ]);
            } catch (error) {
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Failed to remove breakpoints: ${error}`)
                ]);
            }
        }
    };
    disposables.push(lmApi.registerTool('remove_java_breakpoints', removeBreakpointsTool));

    // Tool 8: Stop Debug Session
    const stopDebugSessionTool: LanguageModelTool<StopDebugSessionInput> = {
        async invoke(options: { input: StopDebugSessionInput }, _token: vscode.CancellationToken): Promise<any> {
            try {
                const session = vscode.debug.activeDebugSession;
                
                if (!session) {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('No active debug session to stop.')
                    ]);
                }

                const sessionInfo = `${session.name} (${session.type})`;
                const reason = options.input.reason || 'Investigation complete';
                
                // Stop the debug session
                await vscode.debug.stopDebugging(session);
                
                sendInfo('', {
                    operationName: 'languageModelTool.stopDebugSession',
                    sessionId: session.id,
                    sessionName: session.name,
                    reason: reason
                });
                
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(
                        `✓ Stopped debug session: ${sessionInfo}. Reason: ${reason}`
                    )
                ]);
            } catch (error) {
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Failed to stop debug session: ${error}`)
                ]);
            }
        }
    };
    disposables.push(lmApi.registerTool('stop_debug_session', stopDebugSessionTool));

    // Tool 9: Get Debug Session Info
    const getDebugSessionInfoTool: LanguageModelTool<GetDebugSessionInfoInput> = {
        async invoke(_options: { input: GetDebugSessionInfoInput }, _token: vscode.CancellationToken): Promise<any> {
            try {
                const session = vscode.debug.activeDebugSession;
                
                if (!session) {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart(
                            '❌ No active debug session found.\n\n' +
                            'You can:\n' +
                            '• Start a new debug session using debug_java_application\n' +
                            '• Set breakpoints before or after starting a session\n' +
                            '• Wait for an existing session to hit a breakpoint'
                        )
                    ]);
                }

                // Gather session information
                const sessionInfo = {
                    id: session.id,
                    name: session.name,
                    type: session.type,
                    workspaceFolder: session.workspaceFolder?.name || 'N/A',
                    configuration: {
                        name: session.configuration.name,
                        type: session.configuration.type,
                        request: session.configuration.request,
                        mainClass: session.configuration.mainClass,
                        projectName: session.configuration.projectName
                    }
                };
                
                // Check if session is paused (stopped at breakpoint)
                let isPaused = false;
                let stoppedReason = 'unknown';
                try {
                    // Try to get stack trace - only succeeds if session is paused
                    const stackResponse = await session.customRequest('stackTrace', {
                        threadId: (session as any).threadId || 1,
                        startFrame: 0,
                        levels: 1
                    });
                    
                    if (stackResponse && stackResponse.stackFrames && stackResponse.stackFrames.length > 0) {
                        isPaused = true;
                        // Check threads to get stop reason
                        try {
                            const threadsResponse = await session.customRequest('threads');
                            if (threadsResponse?.threads) {
                                const stoppedThread = threadsResponse.threads.find((t: any) => t.id === (session as any).threadId || t.id === 1);
                                if (stoppedThread) {
                                    stoppedReason = (session as any).stoppedDetails?.reason || 'breakpoint';
                                }
                            }
                        } catch {
                            stoppedReason = 'breakpoint';
                        }
                    }
                } catch {
                    // If stackTrace fails, session is running (not paused)
                    isPaused = false;
                }
                
                const statusLine = isPaused 
                    ? `🔴 Status: PAUSED (stopped: ${stoppedReason})`
                    : '🟢 Status: RUNNING';
                
                const message = [
                    '✓ Active Debug Session Found:',
                    '',
                    statusLine,
                    `• Session ID: ${sessionInfo.id}`,
                    `• Session Name: ${sessionInfo.name}`,
                    `• Debug Type: ${sessionInfo.type}`,
                    `• Workspace: ${sessionInfo.workspaceFolder}`,
                    '',
                    'Configuration:',
                    `• Name: ${sessionInfo.configuration.name || 'N/A'}`,
                    `• Type: ${sessionInfo.configuration.type || 'N/A'}`,
                    `• Request: ${sessionInfo.configuration.request || 'N/A'}`,
                    `• Main Class: ${sessionInfo.configuration.mainClass || 'N/A'}`,
                    `• Project: ${sessionInfo.configuration.projectName || 'N/A'}`,
                    '',
                    'Available Actions:',
                    isPaused 
                        ? '• Use debug tools (get_debug_variables, get_debug_stack_trace, evaluate_debug_expression) to inspect state\n' +
                          '• Use debug_step_operation (stepOver, stepIn, stepOut, continue) to control execution\n' +
                          '• Use stop_debug_session to terminate this session when done'
                        : '⚠️  Session is running - waiting for breakpoint to be hit\n' +
                          '• Set breakpoints with set_java_breakpoint\n' +
                          '• Use stop_debug_session to terminate this session\n' +
                          '• Debug inspection tools require session to be paused at a breakpoint'
                ].join('\n');
                
                sendInfo('', {
                    operationName: 'languageModelTool.getDebugSessionInfo',
                    sessionId: session.id,
                    sessionType: session.type
                });
                
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(message)
                ]);
            } catch (error) {
                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(`✗ Failed to get debug session info: ${error}`)
                ]);
            }
        }
    };
    disposables.push(lmApi.registerTool('get_debug_session_info', getDebugSessionInfoTool));

    return disposables;
}

/**
 * Simple wildcard matching helper
 */
function matchWildcard(text: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$');
    return regex.test(text);
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
