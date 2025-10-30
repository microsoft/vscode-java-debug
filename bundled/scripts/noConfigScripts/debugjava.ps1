# Java No-Config Debug Wrapper Script for PowerShell
# This script intercepts java commands and automatically enables JDWP debugging

# Export the endpoint file path for JDWP port communication
$env:JDWP_ADAPTER_ENDPOINTS = $env:VSCODE_JDWP_ADAPTER_ENDPOINTS

# Set JDWP options only for this debugjava invocation
# This overrides the global JAVA_TOOL_OPTIONS to avoid affecting other Java processes
$env:JAVA_TOOL_OPTIONS = "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0"

# Get the directory of this script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Use Node.js wrapper to capture JDWP port
& node (Join-Path $scriptDir "jdwp-wrapper.js") $args
