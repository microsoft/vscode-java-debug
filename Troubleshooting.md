# Troubleshooting

This document will help troubleshoot the common debugging errors.

## Java Language Support extension is not started or broken.
Java Debugger is leveraging `"Language Support for Java(TM) by Red Hat"` extension for source mapping and project support. If Java Language Support extension is not started or broken, Java Debugger may not work as expected. Here is a simple way to check the Language Server is started. Open a Java or pom.xml file, and then check the status icon at the right corner of VS Code status bar is thumbs up or not.

 ![ status indicator ](https://raw.githubusercontent.com/redhat-developer/vscode-java/master/images/statusMarker.png).

### Try:
1. The usual failure is because the Java Language Support extension doesn't resolve the project model correctly. The workaround is to open VS Code Command Palette (`Ctrl+Shift+P`), and run command `Java: Update project configuration`.
2. The other possible failure is due to the stale workspace cache. The solution is to clean the workspace cache. Delete the following directory:
- Windows : %APPDATA%\Code\User\workspaceStorage\
- MacOS : $HOME/Library/Application Support/Code/User/workspaceStorage/
- Linux : $HOME/.config/Code/User/workspaceStorage/
3. Try more [troubleshooting guide]((https://github.com/redhat-developer/vscode-java/wiki/Troubleshooting)) from the Language Support extension.

## Failed to resolve classpath: xxx.
### Reason:
In launch mode, Java Debugger will auto resolve the classpath based on the given `"mainClass"` and `"projectName"`, if the mainClass or projectName is not correctly configured, it probably throws this kind of error.

### Try:
1. Check the mainClass is correct. The illegal class name is like `"C:\todoapp\main\src\org\microsoft\app\Main.java"`. The debugger doesn't accept the file name as mainClass. It should be `"${packageName}.${className}"` with `"."` seperated, e.g. `"org.microsoft.app.Main"`.
2. Check the projectName is correct. The projectName is not always same as the workspace folder name. The right project name is read from the `"projectDescription/name"` field in the `".project"` file, or the `"artificatId"` field in the `"pom.xml"`.
3. The recommended way is to let the Java Debugger auto resolve the mainClass and projectName. Please backup your launch.json first, then remove it. After that, click F5 to trigger debugging and the Java Debugger will auto resolve the debug configurations into the new generated launch.json.

## Illegal request type in launch.json.
### Try:
1. The `"request"` type is an enum type, it should be `launch` or `attach`.

## Failed to complete hot code replace: xxx.
### Reason:
The `hot code replace` feature depends on the underlying JVM implementation. If you got this error, that means the new changes cannot be hot replaced by JVM.

### Try:
1. Restart the debug session to apply the new changes. Or ignore the message, and continue to debug.

## Please specify the host name and the port of the remote debuggee in the launch.json.
### Reason:
This error occurs when you try to debug remote Java application. You didn't configure the remote machine's host name and debug port correctly.

### Try:
1. Check the remote Java application is launched with debug mode. The typical command to enable debug mode is like `"java -agentlib:jdwp=transport=dt_socket,address=5005,server=y,suspend=n -classpath xxx MyMainClass"`.
2. Check the debug port is not blocked by the remote machine's firewall.

## Failed to evaluate. Reason: Cannot evaluate because the thread is resumed.
### Reason:
There are two possible reasons for this error. 
- Reason 1: you try to evaluate an expression when the target thread is running. Evaluation only works when your program is on suspend, for example, stopping at a breakpoint or step.
- Reason 2: you take the VS Code DEBUG CONSOLE view for program input by mistake. DEBUG CONSOLE only accepts input for evaluation, not for program console input.

### Try:
1. For Reason 1, try to add a breakpoint and stop your program there, then run evaluation expression.
2. For Reason 2, try to change the `console` option in the launch.json to `externalTerminal` or `integratedTerminal`. That's the official solution for console input.

## The Debug CONSOLE throws Error: Could not find or load main class xxx
### Reason:
You configured the wrong main class name in the launch.json.

### Try:
1. Check the mainClass field is configured correctly.
2. If the problem still exists, try to reference `"Java Language Support extension is not started or broken"` paragraph to troubleshoot if the Language Server works well.

## The DEBUG CONSOLE throws ClassNotFoundException
### Reason:
The debugger doesn't resolve the whole classpath list correctly. The possible reason is the Java Language Server is broken.

### Try:
1. Reference `"Java Language Support extension is not started or broken"` paragraph for troubleshooting.

## Cannot find a class with the main method
### Reason:
When mainClass is not configured in the launch.json, the debugger will try to resolve a class with main method. This error means the debugger doesn't find any main class in your workspace.

### Try:
1. Check if there is main class existed in your workspace.
2. If so, it's probably because the Java Language Server is broken. Reference `"Java Language Support extension is not started or broken"` paragraph for troubleshooting.
