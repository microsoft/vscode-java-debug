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

if (!isDebugEnabled) {
    // No debugging, just run java normally
    const javaHome = process.env.JAVA_HOME;
    const javaCmd = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';
    const child = spawn(javaCmd, process.argv.slice(2), {
        stdio: 'inherit',
        shell: false
    });
    child.on('exit', (code) => process.exit(code || 0));
} else {
    // Debugging enabled, capture JDWP port
    const javaHome = process.env.JAVA_HOME;
    const javaCmd = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';
    
    const child = spawn(javaCmd, process.argv.slice(2), {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false
    });

    let portCaptured = false;
    const jdwpPortRegex = /Listening for transport dt_socket at address:\s*(\d+)/;

    // Monitor stdout for JDWP port
    child.stdout.on('data', (data) => {
        const output = data.toString();
        process.stdout.write(data);

        if (!portCaptured) {
            const match = output.match(jdwpPortRegex);
            if (match && match[1]) {
                const port = parseInt(match[1], 10);
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
        }
    });

    // Monitor stderr
    child.stderr.on('data', (data) => {
        const output = data.toString();
        process.stderr.write(data);

        // JDWP message might appear on stderr
        if (!portCaptured) {
            const match = output.match(jdwpPortRegex);
            if (match && match[1]) {
                const port = parseInt(match[1], 10);
                console.log(`[Java Debug] Captured JDWP port: ${port}`);
                
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
        }
    });

    child.on('exit', (code) => process.exit(code || 0));
    child.on('error', (err) => {
        console.error(`[Java Debug] Failed to start java: ${err}`);
        process.exit(1);
    });
}
