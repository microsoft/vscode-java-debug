# Java No-Config Debug Wrapper Script for PowerShell
# This script intercepts java commands and automatically enables JDWP debugging

# Get the directory of this script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Save current environment variables to restore later
$oldJavaToolOptions = $env:JAVA_TOOL_OPTIONS
$oldJdwpAdapterEndpoints = $env:JDWP_ADAPTER_ENDPOINTS

try {
    # Set environment variables only for this debugjava invocation
    $env:JDWP_ADAPTER_ENDPOINTS = $env:VSCODE_JDWP_ADAPTER_ENDPOINTS
    $env:JAVA_TOOL_OPTIONS = "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0"

    # Use Node.js wrapper to capture JDWP port
    & node (Join-Path $scriptDir "jdwp-wrapper.js") $args
}
finally {
    # Restore original environment variables to avoid affecting subsequent commands
    if ($null -eq $oldJavaToolOptions) {
        Remove-Item Env:\JAVA_TOOL_OPTIONS -ErrorAction SilentlyContinue
    } else {
        $env:JAVA_TOOL_OPTIONS = $oldJavaToolOptions
    }
    
    if ($null -eq $oldJdwpAdapterEndpoints) {
        Remove-Item Env:\JDWP_ADAPTER_ENDPOINTS -ErrorAction SilentlyContinue
    } else {
        $env:JDWP_ADAPTER_ENDPOINTS = $oldJdwpAdapterEndpoints
    }
}
