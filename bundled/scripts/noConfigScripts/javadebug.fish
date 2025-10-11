#!/usr/bin/env fish
# Java No-Config Debug Wrapper Script for Fish Shell
# This script intercepts java commands and automatically enables JDWP debugging

# Export the endpoint file path for JDWP port communication
set -x JDWP_ADAPTER_ENDPOINTS $VSCODE_JDWP_ADAPTER_ENDPOINTS

# Get the directory of this script
set script_dir (dirname (status -f))

# Use Node.js wrapper to capture JDWP port
exec node "$script_dir/jdwp-wrapper.js" $argv
