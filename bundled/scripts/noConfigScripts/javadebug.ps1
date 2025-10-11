# Java No-Config Debug Wrapper Script for PowerShell
# This script intercepts java commands and automatically enables JDWP debugging

# Export the endpoint file path for JDWP port communication
$env:JDWP_ADAPTER_ENDPOINTS = $env:VSCODE_JDWP_ADAPTER_ENDPOINTS

# Get the directory of this script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Use Node.js wrapper to capture JDWP port
& node (Join-Path $scriptDir "jdwp-wrapper.js") $args
