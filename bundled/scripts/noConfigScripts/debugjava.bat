@echo off
REM Java No-Config Debug Wrapper Script for Windows
REM This script intercepts java commands and automatically enables JDWP debugging

REM Export the endpoint file path for JDWP port communication
set JDWP_ADAPTER_ENDPOINTS=%VSCODE_JDWP_ADAPTER_ENDPOINTS%

REM Set JDWP options only for this debugjava invocation
REM This overrides the global JAVA_TOOL_OPTIONS to avoid affecting other Java processes
set JAVA_TOOL_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0

REM Use Node.js wrapper to capture JDWP port
node "%~dp0jdwp-wrapper.js" %*
