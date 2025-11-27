#!/usr/bin/env fish
# Java No-Config Debug Wrapper Script for Fish Shell
# This script intercepts java commands and automatically enables JDWP debugging

# Get the directory of this script
set script_dir (dirname (status -f))

# Set environment variables only for the node process, not the current shell
# This ensures JAVA_TOOL_OPTIONS doesn't affect subsequent commands in the terminal
env JDWP_ADAPTER_ENDPOINTS=$VSCODE_JDWP_ADAPTER_ENDPOINTS \
    JAVA_TOOL_OPTIONS="-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0" \
    node "$script_dir/jdwp-wrapper.js" $argv
