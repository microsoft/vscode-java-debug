// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { sendError, sendInfo } from "vscode-extension-telemetry-wrapper";

// ============================================================================
// Constants
// ============================================================================
const CONSTANTS = {
    /** Timeout for waitForSession mode (ms) */
    SESSION_WAIT_TIMEOUT: 45000,
    /** Maximum wait time for smart polling (ms) */
    SMART_POLLING_MAX_WAIT: 15000,
    /** Interval between polling checks (ms) */
    SMART_POLLING_INTERVAL: 300,
    /** Timeout for build tasks (ms) */
    BUILD_TIMEOUT: 60000,
    /** Maximum number of Java files to check for compilation errors */
    MAX_JAVA_FILES_TO_CHECK: 100,
    /** Default stack trace depth */
    DEFAULT_STACK_DEPTH: 50,
    /** Maximum depth for recursive file search */
    MAX_FILE_SEARCH_DEPTH: 10
};

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
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }

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

            // Set a timeout for large applications
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
                        message: `❌ Debug session failed to start within ${CONSTANTS.SESSION_WAIT_TIMEOUT / 1000} seconds for ${targetInfo}.\n\n` +
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
            }, CONSTANTS.SESSION_WAIT_TIMEOUT);
        });
    } else {
        // Default behavior: send command and use smart polling to detect session start
        terminal.sendText(debugCommand);

        // Smart polling to detect session start
        const maxWaitTime = CONSTANTS.SMART_POLLING_MAX_WAIT;
        const pollInterval = CONSTANTS.SMART_POLLING_INTERVAL;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
            // Check if debug session has started
            const session = vscode.debug.activeDebugSession;
            if (session && session.type === 'java') {
                const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

                sendInfo('', {
                    operationName: 'languageModelTool.debugSessionDetected',
                    sessionId: session.id,
                    elapsedTime
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
            maxWaitTime
        });

        return {
            success: true,
            status: 'timeout',
            message: `⚠️ Debug command sent for ${targetInfo}, but session not detected within ${CONSTANTS.SMART_POLLING_MAX_WAIT / 1000} seconds.\n\n` +
                     `Possible reasons:\n` +
                     `• Application is still starting (large projects may take longer)\n` +
                     `• Compilation errors (check terminal '${terminal.name}' for errors)\n` +
                     `• Application may have started and already terminated\n\n` +
                     `Next steps:\n` +
                     `• Use get_debug_session_info() to check if session is now active\n` +
                     `• Check terminal '${terminal.name}' for error messages\n` +
                     `• If starting slowly, wait a bit longer and check again${warningNote}`,
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
            return buildMavenProject(workspaceUri);

        case 'gradle':
            return buildGradleProject(workspaceUri);

        case 'vscode':
            return ensureVSCodeCompilation(workspaceUri);

        case 'unknown':
            // Try to proceed anyway - user might have manually compiled
            return {
                success: true,
                message: 'Unknown project type. Skipping build step. Ensure your Java files are compiled.'
            };
    }
}

/**
 * Executes a shell task and waits for completion.
 * This is a common function used by both Maven and Gradle builds.
 */
async function executeShellTask(
    workspaceUri: vscode.Uri,
    taskId: string,
    taskName: string,
    command: string,
    successMessage: string,
    timeoutMessage: string,
    failureMessagePrefix: string
): Promise<DebugJavaApplicationResult> {
    return new Promise((resolve) => {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceUri);
        if (!workspaceFolder) {
            resolve({
                success: false,
                message: `Cannot find workspace folder for ${workspaceUri.fsPath}`
            });
            return;
        }

        const task = new vscode.Task(
            { type: 'shell', task: taskId },
            workspaceFolder,
            taskName,
            'Java Debug',
            new vscode.ShellExecution(command, { cwd: workspaceUri.fsPath })
        );

        let resolved = false;
        let taskDisposable: vscode.Disposable | undefined;
        let errorDisposable: vscode.Disposable | undefined;

        const cleanup = () => {
            clearTimeout(timeoutHandle);
            taskDisposable?.dispose();
            errorDisposable?.dispose();
        };

        // Set a timeout to avoid hanging indefinitely
        const timeoutHandle = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve({
                    success: true,
                    message: timeoutMessage
                });
            }
        }, CONSTANTS.BUILD_TIMEOUT);

        vscode.tasks.executeTask(task).then(
            (execution) => {
                taskDisposable = vscode.tasks.onDidEndTask((e) => {
                    if (e.execution === execution && !resolved) {
                        resolved = true;
                        cleanup();
                        resolve({
                            success: true,
                            message: successMessage
                        });
                    }
                });

                errorDisposable = vscode.tasks.onDidEndTaskProcess((e) => {
                    if (e.execution === execution && e.exitCode !== 0 && !resolved) {
                        resolved = true;
                        cleanup();
                        resolve({
                            success: false,
                            message: `${failureMessagePrefix} with exit code ${e.exitCode}. Please check the terminal output.`
                        });
                    }
                });
            },
            (error: Error) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve({
                        success: false,
                        message: `Failed to execute task: ${error.message}`
                    });
                }
            }
        );
    });
}

/**
 * Builds a Maven project using mvn compile.
 */
async function buildMavenProject(
    workspaceUri: vscode.Uri
): Promise<DebugJavaApplicationResult> {
    return executeShellTask(
        workspaceUri,
        'maven-compile',
        'Maven Compile',
        'mvn compile',
        'Maven project compiled successfully',
        'Maven compile command sent. Build may still be in progress.',
        'Maven build failed'
    );
}

/**
 * Builds a Gradle project using gradle classes.
 */
async function buildGradleProject(
    workspaceUri: vscode.Uri
): Promise<DebugJavaApplicationResult> {
    const gradleWrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const gradleCommand = fs.existsSync(path.join(workspaceUri.fsPath, gradleWrapper))
        ? gradleWrapper
        : 'gradle';

    return executeShellTask(
        workspaceUri,
        'gradle-classes',
        'Gradle Classes',
        `${gradleCommand} classes`,
        'Gradle project compiled successfully',
        'Gradle compile command sent. Build may still be in progress.',
        'Gradle build failed'
    );
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
            CONSTANTS.MAX_JAVA_FILES_TO_CHECK
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
                    detectedClassName,
                    projectType
                });
                className = detectedClassName;
            } else {
                // No package detected - class is in default package
                sendInfo('', {
                    operationName: 'languageModelTool.classNameDetection.noPackage',
                    simpleClassName: input.target,
                    projectType
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
            const javaFile = findJavaFile(srcDir, simpleClassName, 0);
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
 * @param depth Current recursion depth (for limiting search depth)
 */
function findJavaFile(dir: string, className: string, depth: number = 0): string | null {
    // Limit recursion depth to prevent performance issues
    if (depth > CONSTANTS.MAX_FILE_SEARCH_DEPTH) {
        return null;
    }

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
                const found = findJavaFile(filePath, className, depth + 1);
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
 * @param depth Current recursion depth (for limiting search depth)
 */
function hasClassFiles(dir: string, depth: number = 0): boolean {
    // Limit recursion depth to prevent performance issues
    if (depth > CONSTANTS.MAX_FILE_SEARCH_DEPTH) {
        return false;
    }

    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isFile() && file.endsWith('.class')) {
                return true;
            } else if (stat.isDirectory()) {
                if (hasClassFiles(filePath, depth + 1)) {
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
    threadId?: number;
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
    threadId?: number;
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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
type GetDebugSessionInfoInput = Record<string, never>;

/**
 * Result of finding a suspended thread
 */
interface SuspendedThreadInfo {
    threadId: number;
    frameId: number;
}

/**
 * Finds the first suspended thread in the debug session.
 * Returns the thread ID and top frame ID, or null if no suspended thread is found.
 */
async function findFirstSuspendedThread(session: vscode.DebugSession): Promise<SuspendedThreadInfo | null> {
    try {
        const threadsResponse = await session.customRequest('threads');
        for (const thread of threadsResponse.threads || []) {
            try {
                const stackResponse = await session.customRequest('stackTrace', {
                    threadId: thread.id,
                    startFrame: 0,
                    levels: 1
                });
                if (stackResponse?.stackFrames?.length > 0) {
                    return {
                        threadId: thread.id,
                        frameId: stackResponse.stackFrames[0].id
                    };
                }
            } catch {
                // Thread is running, continue to next
                continue;
            }
        }
    } catch {
        // Failed to get threads
    }
    return null;
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

                const { threadId, frameId = 0, scopeType = 'all', filter } = options.input;

                // Find the target thread - either specified or find first suspended thread
                let targetThreadId = threadId;
                if (!targetThreadId) {
                    const suspendedThread = await findFirstSuspendedThread(session);
                    if (suspendedThread) {
                        targetThreadId = suspendedThread.threadId;
                    }
                }

                if (!targetThreadId) {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('✗ No suspended thread found. Use get_debug_threads() to see thread states.')
                    ]);
                }

                // Get stack trace to access frame
                const stackResponse = await session.customRequest('stackTrace', {
                    threadId: targetThreadId,
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

                const variables: string[] = [];
                for (const scope of scopesResponse.scopes) {
                    // Filter by scope type
                    if (scopeType === 'local' && scope.name !== 'Local' && scope.name !== 'Locals') {
                        continue;
                    }
                    if (scopeType === 'static' && scope.name !== 'Static') {
                        continue;
                    }

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
                        `Variables (Thread #${targetThreadId}, Frame ${frameId}):\n${variables.join('\n')}`
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

                const { threadId, maxDepth = CONSTANTS.DEFAULT_STACK_DEPTH } = options.input;

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

                const { expression, threadId, frameId = 0, context = 'repl' } = options.input;

                // Find the target thread and frame for evaluation
                let targetFrameId: number = frameId;
                let targetThreadId = threadId;

                // If no threadId specified, find first suspended thread
                if (!targetThreadId) {
                    const suspendedThread = await findFirstSuspendedThread(session);
                    if (suspendedThread) {
                        targetThreadId = suspendedThread.threadId;
                        // Use the actual frame ID from the stack if frameId is 0
                        if (frameId === 0) {
                            targetFrameId = suspendedThread.frameId;
                        }
                    }
                } else {
                    // Get the frame ID for the specified thread
                    try {
                        const stackResponse = await session.customRequest('stackTrace', {
                            threadId: targetThreadId,
                            startFrame: frameId,
                            levels: 1
                        });
                        if (stackResponse?.stackFrames?.length > 0) {
                            targetFrameId = stackResponse.stackFrames[0].id;
                        }
                    } catch {
                        return new (vscode as any).LanguageModelToolResult([
                            new (vscode as any).LanguageModelTextPart(`✗ Thread #${targetThreadId} is not suspended. Cannot evaluate expression.`)
                        ]);
                    }
                }

                if (!targetThreadId) {
                    return new (vscode as any).LanguageModelToolResult([
                        new (vscode as any).LanguageModelTextPart('✗ No suspended thread found. Use get_debug_threads() to see thread states.')
                    ]);
                }

                const evalResponse = await session.customRequest('evaluate', {
                    expression,
                    frameId: targetFrameId,
                    context
                });

                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(
                        `Expression: ${expression}\n` +
                        `Thread: #${targetThreadId}\n` +
                        `Result: ${evalResponse.result}${evalResponse.type ? ` (${evalResponse.type})` : ''}`
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

                // Check each thread's state by trying to get its stack trace
                const threadInfos: string[] = [];
                for (const thread of threadsResponse.threads) {
                    let state = '🟢 RUNNING';
                    let location = '';

                    try {
                        const stackResponse = await session.customRequest('stackTrace', {
                            threadId: thread.id,
                            startFrame: 0,
                            levels: 1
                        });

                        if (stackResponse?.stackFrames?.length > 0) {
                            state = '🔴 SUSPENDED';
                            const topFrame = stackResponse.stackFrames[0];
                            if (topFrame.source) {
                                location = ` at ${topFrame.source.name}:${topFrame.line}`;
                            }
                        }
                    } catch {
                        // Thread is running, can't get stack
                        state = '🟢 RUNNING';
                    }

                    threadInfos.push(`Thread #${thread.id}: ${thread.name} [${state}]${location}`);
                }

                return new (vscode as any).LanguageModelToolResult([
                    new (vscode as any).LanguageModelTextPart(
                        `═══════════════════════════════════════════\n` +
                        `THREADS (${threadsResponse.threads.length} total)\n` +
                        `═══════════════════════════════════════════\n\n` +
                        `${threadInfos.join('\n')}\n\n` +
                        `───────────────────────────────────────────\n` +
                        `💡 Use threadId parameter to inspect a specific thread:\n` +
                        `• get_debug_variables(threadId=X)\n` +
                        `• get_debug_stack_trace(threadId=X)\n` +
                        `• evaluate_debug_expression(threadId=X, expression="...")\n` +
                        `───────────────────────────────────────────`
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
                    reason
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

                // Check if session is paused and get current location
                // Strategy: Get all threads first, then try to get stack trace for each
                // A thread is paused if we can successfully get its stack trace
                let isPaused = false;
                let stoppedReason = 'unknown';
                let currentLocation = '';
                let currentFile = '';
                let currentLine = 0;
                let stoppedThreadId: number | undefined;
                let stoppedThreadName = '';

                try {
                    // Step 1: Get all threads
                    const threadsResponse = await session.customRequest('threads');
                    const threads = threadsResponse?.threads || [];

                    // Step 2: Try to get stack trace for each thread to find paused one
                    // In Java debug, only paused threads can provide stack traces
                    for (const thread of threads) {
                        try {
                            const stackResponse = await session.customRequest('stackTrace', {
                                threadId: thread.id,
                                startFrame: 0,
                                levels: 1
                            });

                            // If we got stack frames, this thread is paused
                            if (stackResponse?.stackFrames?.length > 0) {
                                isPaused = true;
                                stoppedThreadId = thread.id;
                                stoppedThreadName = thread.name || `Thread-${thread.id}`;

                                const topFrame = stackResponse.stackFrames[0];

                                // Extract current location details
                                if (topFrame.source) {
                                    currentFile = topFrame.source.path || topFrame.source.name || 'unknown';
                                    currentLine = topFrame.line || 0;
                                    const methodName = topFrame.name || 'unknown';
                                    const fileName = topFrame.source.name || path.basename(currentFile);
                                    currentLocation = `${fileName}:${currentLine} in ${methodName}`;
                                }

                                // Try to determine stop reason from thread name or default to breakpoint
                                stoppedReason = 'breakpoint';

                                // Found a paused thread, no need to check others for basic info
                                break;
                            }
                        } catch {
                            // This thread is running, not paused - continue to next
                            continue;
                        }
                    }

                    // If no thread had stack frames, all are running
                    if (!isPaused && threads.length > 0) {
                        // Session exists but all threads are running
                        isPaused = false;
                    }
                } catch (error) {
                    // If we can't even get threads, something is wrong
                    // But session exists, so mark as running
                    isPaused = false;
                    sendInfo('', {
                        operationName: 'languageModelTool.getDebugSessionInfo.threadError',
                        error: String(error)
                    });
                }

                // Build status line with location info
                let statusLine: string;
                let locationInfo = '';

                if (isPaused) {
                    statusLine = `🔴 Status: PAUSED (${stoppedReason})`;
                    locationInfo = [
                        '',
                        '📍 Current Location:',
                        `• File: ${currentFile}`,
                        `• Line: ${currentLine}`,
                        `• Method: ${currentLocation}`,
                        `• Thread: ${stoppedThreadName} (ID: ${stoppedThreadId})`
                    ].join('\n');
                } else {
                    statusLine = '🟢 Status: RUNNING';
                }

                // Build clear action guidance based on state
                let actionGuidance: string;
                if (isPaused) {
                    actionGuidance = [
                        '✅ READY FOR INSPECTION - Session is paused at breakpoint',
                        '',
                        'You can now:',
                        '• evaluate_debug_expression - Test your hypothesis (e.g., "user == null")',
                        '• get_debug_variables - Inspect specific variables',
                        '• get_debug_stack_trace - See full call stack',
                        '• debug_step_operation - Step through code (stepOver, stepIn, stepOut)',
                        '• debug_step_operation(continue) - Resume to next breakpoint',
                        '• stop_debug_session - End debugging when done'
                    ].join('\n');
                } else {
                    actionGuidance = [
                        '⏳ WAITING - Session is running, not yet at breakpoint',
                        '',
                        'The program is executing. To pause:',
                        '• Wait for it to hit your breakpoint',
                        '• Or use debug_step_operation(pause) to pause immediately',
                        '',
                        'Inspection tools (get_debug_variables, evaluate_debug_expression) ',
                        'will NOT work until the session is PAUSED.'
                    ].join('\n');
                }

                // Determine if this is a debugjava (No-Config) session that can be safely stopped
                const isNoConfigSession = sessionInfo.name.includes('No-Config') ||
                                          sessionInfo.name.includes('debugjava');
                const launchMethod = isNoConfigSession
                    ? 'debugjava (No-Config) - ✅ Can be safely stopped'
                    : sessionInfo.configuration.request === 'attach'
                        ? 'External attach - ⚠️ Stopping will disconnect from process'
                        : 'VS Code launch - ✅ Can be safely stopped';

                const message = [
                    '═══════════════════════════════════════════',
                    isPaused ? '🔴 DEBUG SESSION PAUSED' : '🟢 DEBUG SESSION RUNNING',
                    '═══════════════════════════════════════════',
                    '',
                    statusLine,
                    locationInfo,
                    '',
                    '───────────────────────────────────────────',
                    'Session Details:',
                    `• Session ID: ${sessionInfo.id}`,
                    `• Name: ${sessionInfo.name}`,
                    `• Type: ${sessionInfo.type}`,
                    `• Request: ${sessionInfo.configuration.request || 'N/A'}`,
                    `• Launch Method: ${launchMethod}`,
                    `• Main Class: ${sessionInfo.configuration.mainClass || 'N/A'}`,
                    '',
                    '───────────────────────────────────────────',
                    actionGuidance,
                    '═══════════════════════════════════════════'
                ].join('\n');

                sendInfo('', {
                    operationName: 'languageModelTool.getDebugSessionInfo',
                    sessionId: session.id,
                    sessionType: session.type,
                    isPaused: String(isPaused),
                    stoppedThreadId: String(stoppedThreadId || ''),
                    currentFile,
                    currentLine: String(currentLine)
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
