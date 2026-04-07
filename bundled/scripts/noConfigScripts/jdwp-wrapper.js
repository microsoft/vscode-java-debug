#!/usr/bin/env node
/**
 * JDWP Port Listener and Communication Wrapper
 * 
 * This script wraps Java process execution and captures the JDWP port
 * from the JVM output, then writes it to the endpoint file for VS Code
 * to pick up and attach the debugger.
 * 
 * JDWP Output Format:
 * "Listening for transport dt_socket at address: 12345"
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get environment variables
const endpointFile = process.env.JDWP_ADAPTER_ENDPOINTS || process.env.VSCODE_JDWP_ADAPTER_ENDPOINTS;
const javaToolOptions = process.env.JAVA_TOOL_OPTIONS || '';

// Check if debugging is enabled
const isDebugEnabled = javaToolOptions.includes('jdwp') && endpointFile;

// Helper function to find java command
function getJavaCommand() {
    // Priority 1: Try JAVA_HOME environment variable first (user's explicit choice)
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
        const javaPath = path.join(javaHome, 'bin', 'java');
        const javaPathExe = process.platform === 'win32' ? `${javaPath}.exe` : javaPath;
        
        // Check if the file exists
        if (fs.existsSync(javaPathExe)) {
            return javaPath;
        }
        if (fs.existsSync(javaPath)) {
            return javaPath;
        }
        
        console.warn(`[Java Debug] JAVA_HOME is set to '${javaHome}', but java command not found there. Falling back to VS Code's Java.`);
    }
    
    // Priority 2: Use VSCODE_JAVA_EXEC if provided by VS Code (from Java Language Server)
    const vscodeJavaExec = process.env.VSCODE_JAVA_EXEC;
    if (vscodeJavaExec && fs.existsSync(vscodeJavaExec)) {
        return vscodeJavaExec;
    }
    
    // Priority 3: Fall back to 'java' in PATH
    return 'java';
}

const javaCmd = getJavaCommand();

// Helper function to setup signal handlers for graceful termination
function setupSignalHandlers(child) {
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
        process.on(signal, () => {
            child.kill(signal);
        });
    });
}

if (!isDebugEnabled) {
    // No debugging, just run java normally
    const child = spawn(javaCmd, process.argv.slice(2), {
        stdio: 'inherit',
        shell: false
    });
    setupSignalHandlers(child);
    // Use 'close' event to ensure stdio streams are closed before exiting
    child.on('close', (code) => process.exit(code || 0));
    child.on('error', (err) => {
        console.error(`[Java Debug] Failed to start java: ${err.message}`);
        console.error(`[Java Debug] Make sure Java is installed and either JAVA_HOME is set correctly or 'java' is in your PATH.`);
        process.exit(1);
    });
} else {
    // Debugging enabled, capture JDWP port
    const child = spawn(javaCmd, process.argv.slice(2), {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false
    });
    setupSignalHandlers(child);

    let portCaptured = false;
    const jdwpPortRegex = /Listening for transport dt_socket at address:\s*(\d+)/;

    // Shared function to capture JDWP port from output
    const capturePort = (output) => {
        if (portCaptured) return;
        
        const match = output.match(jdwpPortRegex);
        if (match && match[1]) {
            const port = parseInt(match[1], 10);
            
            // Validate port range
            if (port < 1 || port > 65535) {
                console.error(`[Java Debug] Invalid port number: ${port}`);
                return;
            }
            
            console.log(`[Java Debug] Captured JDWP port: ${port}`);
            
            // Write port to endpoint file
            const endpointData = JSON.stringify({
                client: {
                    host: 'localhost',
                    port: port
                }
            });

            try {
                fs.writeFileSync(endpointFile, endpointData, 'utf8');
                console.log(`[Java Debug] Wrote endpoint file: ${endpointFile}`);
                portCaptured = true;
            } catch (err) {
                console.error(`[Java Debug] Failed to write endpoint file: ${err}`);
            }
        }
    };

    // Monitor stdout for JDWP port
    child.stdout.on('data', (data) => {
        const output = data.toString();
        process.stdout.write(data);
        capturePort(output);
    });

    // Monitor stderr for JDWP port (it might appear on stderr)
    child.stderr.on('data', (data) => {
        const output = data.toString();
        process.stderr.write(data);
        capturePort(output);
    });

    // Use 'close' event to ensure stdio streams are closed before exiting
    child.on('close', (code) => process.exit(code || 0));
    child.on('error', (err) => {
        console.error(`[Java Debug] Failed to start java: ${err}`);
        process.exit(1);
    });
}
