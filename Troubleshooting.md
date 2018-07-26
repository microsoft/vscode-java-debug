# Troubleshooting

This document will help troubleshoot the common debugging errors. If you still cannot solve your problems, please [submit an issue](https://github.com/Microsoft/vscode-java-debug/issues).

## Java Language Support extension fails to start.
Java Debugger is leveraging `"Language Support for Java(TM) by Red Hat"` extension for source mapping and project support. If Java Language Support extension fails to start, Java Debugger may not work as expected. Here is a simple way to check the Language Server is started. Open a Java or pom.xml file, and then check the status icon at the right corner of VS Code status bar is thumbs up or not.

 ![ status indicator ](https://raw.githubusercontent.com/redhat-developer/vscode-java/master/images/statusMarker.png).

### Try:
1. If you get the error `"The JAVA_HOME environment variable points to a missing folder"` or `"Java runtime could not be located"`, please make sure the JAVA_HOME and bin path point to a valid JDK home directory. Otherwise, ignore this step.
2. Open VS Code Command Palette (`Ctrl+Shift+P`), and run command `"Java: Update project configuration"` to force the Language Support extension to resolve the project relationship again.
3. If the step above doesn't work, please try to clean the stale workspace cache. Close all opened VS Code windows first and delete the following cache directory:
- Windows : %APPDATA%\Code\User\workspaceStorage\
- MacOS : $HOME/Library/Application Support/Code/User/workspaceStorage/
- Linux : $HOME/.config/Code/User/workspaceStorage/
4. Try more [troubleshooting guide](https://github.com/redhat-developer/vscode-java/wiki/Troubleshooting) from the Language Support extension.

## Failed to resolve classpath: xxx.
### Reason:
In launch mode, Java Debugger will auto resolve the classpath based on the given `"mainClass"` and `"projectName"`, if the mainClass or projectName is not correctly configured, it probably throws this kind of error.

### Try:
1. Check the mainClass is correct. The illegal class name is like `"C:\todoapp\main\src\org\microsoft\app\Main.java"`. The debugger doesn't accept the file name as mainClass. It should be `"${packageName}.${className}"` with `"."` seperated, e.g. `"org.microsoft.app.Main"`.
2. Check the projectName is correct. The projectName is not always same as the workspace folder name. Usually the project name is read from the `"projectDescription/name"` field in the `".project"` file, or the `"artificatId"` field in the `"pom.xml"`.
3. If the problem still exists, please use the auto generation feature provided by Java Debugger. Remove the existing launch.json file, and click F5, then Java Debugger will auto resolve the debug configurations into a new generated launch.json.

## Request type "xxx" is not supported. Only "launch" and "attach" are supported.
### Reason:
The configurations in the launch.json are illegal.

### Try:
1. Reference the VSCode official document [launch configurations](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations) about how to configure launch.json.
2. Another alternative workaround is to remove the existing launch.json file, and click F5, then Java Debugger will auto generate the launch.json for you.

## Failed to complete hot code replace: xxx.
### Reason:
This error indicates you are doing `Hot Code Replace`. The `Hot Code Replace` feature depends on the underlying JVM implementation. If you get this error, that indicates the new changes cannot be hot replaced by JVM.

### Try:
1. Restart your application to apply the new changes. Or ignore the message, and continue to debug.

## Please specify the host name and the port of the remote debuggee in the launch.json.
### Reason:
This error occurs when you try to debug remote Java application. You don't configure the remote machine's host name and debug port correctly.

### Try:
1. Check the remote Java application is launched in debug mode. The typical command to enable debug mode is like `"java -agentlib:jdwp=transport=dt_socket,address=5005,server=y,suspend=n -classpath xxx MyMainClass"`. The parameter `address=5005` represents the target VM exposes `5005` as the debug port.
2. Check the debug port is not blocked by the remote machine's firewall.

## Failed to evaluate. Reason: Cannot evaluate because the thread is resumed.
### Reason:
There are two possible reasons for this error. 
- Reason 1: you try to evaluate an expression when the target thread is running. Evaluation only works when your program is on suspend, for example, stopping at a breakpoint or step.
- Reason 2: you take the VS Code DEBUG CONSOLE view for program input by mistake. DEBUG CONSOLE only accepts input for evaluation, not for program console input.

### Try:
1. For Reason 1, try to add a breakpoint and stop your program there, then run the evaluation expression.
2. For Reason 2, try to change the `console` option in the launch.json to `externalTerminal` or `integratedTerminal`. That's the official solution for program console input.

## The DEBUG CONSOLE throws Error: Could not find or load main class xxx
### Reason:
You configure the incorrect main class name in the launch.json.

### Try:
1. Check the `mainClass` option in the launch.json.
2. If the problem still exists, it's probably because Java Language Support extension doesn't load your project correctly. Please try to reference `"Java Language Support extension fails to start"` paragraph to troubleshoot if the Language Server works well.

## The DEBUG CONSOLE throws ClassNotFoundException
### Reason:
This error indicates your application attempts to reference some classes which are not be found in the entire classpath.

### Try:
1. Check you configure the dependency settings file (e.g. pom.xml) correctly.
2. Open VS Code Command Palette (`Ctrl+Shift+P`), and run command `"Java: Force Java compilation"` to force a build.
3. If the problem still exists, it's probably because Java Language Support extension doesn't load your project correctly. Please try to reference `"Java Language Support extension fails to start"` paragraph to troubleshoot if the Language Server works well.

## Cannot find a class with the main method
### Reason:
When the `mainClass` option is not configured in the launch.json, the debugger will try to auto resolve a class with main method. This error indicates the debugger doesn't find any main class in your workspace.

### Try:
1. Check at least one main class exists in your workspace.
2. If not, add a main class first. Otherwise, it's probably because the Java Language Server fails to start. Reference `"Java Language Support extension fails to start"` paragraph for troubleshooting.
