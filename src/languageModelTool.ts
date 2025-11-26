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
}

interface DebugJavaApplicationResult {
    success: boolean;
    message: string;
    terminalName?: string;
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
    
    // Step 4: Execute in terminal (non-blocking)
    const terminal = vscode.window.createTerminal({
        name: 'Java Debug',
        cwd: input.workspacePath,
        hideFromUser: false,
        isTransient: false  // Keep terminal alive even after process exits
    });
    
    terminal.show();
    
    // Send the command and return immediately - don't wait for process to finish
    // This is crucial because the Java process will run until user stops it
    terminal.sendText(debugCommand);

    // Give a brief moment for the command to start
    await new Promise(resolve => setTimeout(resolve, 500));

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

    return {
        success: true,
        message: `Debug session started for ${targetInfo}. The Java application is now running in debug mode in terminal '${terminal.name}'. The VS Code debugger should attach automatically. You can set breakpoints in your Java source files.${warningNote}`,
        terminalName: terminal.name
    };
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
