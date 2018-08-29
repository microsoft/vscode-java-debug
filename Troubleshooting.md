# Troubleshooting

This document provides the information needed to troubleshoot common errors of Debugger for Java (the debugger). If it does not cover the problem you are seeing, please [log an issue](https://github.com/Microsoft/vscode-java-debug/issues) instead.

## Java Language Support extension fails to start.
The debugger works with [Language Support for Java(TM) by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) (the language server) for source mapping and project support. If the language server fails to start, the debugger will not work as expected. Here is a simple way to check whether the language server is started. Open a .java or a Java project folder in VS Code, and then check the icon at the right side of the status bar. You should see the 👍 icon if the language server is loaded correctly.

 ![status indicator](https://raw.githubusercontent.com/redhat-developer/vscode-java/master/images/statusMarker.png).

### Try:
1. If you get the error *"The JAVA_HOME environment variable points to a missing folder"* or *"Java runtime could not be located"*, please make sure that the environment variable JAVA_HOME points to a valid JDK. Otherwise, ignore this step.
2. Open your Maven *pom.xml* file or Gradle *build.gradle* file, then run VS Code command *"Java: Update project configuration"* to force the language server to update the project configuration/classpath.
3. Try cleaning the stale workspace cache. Quit all VS Code processes and clean the following cache directory:
- Windows : %APPDATA%\Code\User\workspaceStorage\
- MacOS : $HOME/Library/Application Support/Code/User/workspaceStorage/
- Linux : $HOME/.config/Code/User/workspaceStorage/
4. Try more [troubleshooting guide](https://github.com/redhat-developer/vscode-java/wiki/Troubleshooting) from the language server product site.

## Failed to resolve classpath:
### Reason:
Below are the common failure reasons.
- 'C:\demo\org\microsoft\app\Main.java' is not a valid class name.
- Main class 'org.microsoft.app.Main' doesn't exist in the workspace.
- Main class 'org.microsoft.app.Main' isn't unique in the workspace.
- The project 'demo' is not a valid java project.

In launch mode, the debugger resolves the classpaths automatically based on the given `mainClass` and `projectName`. It looks for the class specified by `mainClass` as the entry point for launching an application. If there are multiple classes with the same name in the current workspace, the debugger uses the one inside the project specified by `projectName`.

### Try:
1. Check whether the class name specified in `mainClass` exists and is in the right form. The debugger only works with fully qualified class names, e.g. `org.microsoft.app.Main`.
2. Check whether the `projectName` is correct. The actual project name is not always the same to the folder name you see in the File Explorer. Please check the value specified by `projectDescription/name` in the *.project* file, or the `artificatId` in the *pom.xml* for maven project, or the folder name for gradle project.
3. If the problem persists, please try to use the debugger to regenerate the debug configurations in *launch.json*. Remove the existing *launch.json* file and press F5. The debugger will automatically generate a new *launch.json* with the right debug configurations.

## Request type "xyz" is not supported. Only "launch" and "attach" are supported.
### Reason:
The value specified in `request` option of *launch.json* is incorrect.

### Try:
1. Reference the VS Code official document [launch configurations](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations) about how to configure *launch.json*.
2. Try to use the debugger to regenerate the debug configurations in *launch.json*. Remove the existing *launch.json* file and press F5. The debugger will automatically generate a new *launch.json* with the right debug configurations.

## Failed to complete hot code replace:
### Reason:
This error indicates you are doing `Hot Code Replace`. The `Hot Code Replace` feature depends on the underlying JVM implementation. If you get this error, that indicates the new changes cannot be hot replaced by JVM.

### Try:
1. Restart your application to apply the new changes. Or ignore the message, and continue to debug.
2. You can disable the hot code replace feature by changing the user setting `"java.debug.settings.enableHotCodeReplace": false`.

## Please specify the host name and the port of the remote debuggee in the launch.json.
### Reason:
This error indicates you are debugging a remote Java application. The reason is that you don't configure the remote machine's host name and debug port correctly.

### Try:
1. Check whether the remote Java application is launched in debug mode. The typical command to enable debug mode is like *"java -agentlib:jdwp=transport=dt_socket,address=5005,server=y,suspend=n -classpath \<classpath list\> MyMainClass"*, where the parameter *"address=5005"* represents the target JVM exposes *5005* as the debug port.
2. Check the debug port is not blocked by the remote machine's firewall.

## Failed to evaluate. Reason: Cannot evaluate because the thread is resumed.
### Reason:
There are two possible reasons for this error. 
- Reason 1: you try to evaluate an expression when the target thread is running. Evaluation only works when your program is on suspend, for example, stopping at a breakpoint or stepping in/out/over.
- Reason 2: you take the VS Code DEBUG CONSOLE view for program input by mistake. DEBUG CONSOLE only accepts input for evaluation, not for program console input.

### Try:
1. For Reason 1, try to add a breakpoint and stop your program there, then evaluate the expression.
2. For Reason 2, try to change the `console` option in the *launch.json* to `externalTerminal` or `integratedTerminal`. This is the official solution for program console input.

## The DEBUG CONSOLE throws Error: Could not find or load main class xyz
### Reason:
You configure the incorrect main class name in `mainClass` of *launch.json*.

### Try:
1. Check whether the class name specified in `mainClass` exists and is in the right form.
2. If the problem persists, it's probably because the language server doesn't load your project correctly. Please reference the [language server troubleshooting](#try) paragraph for more troubleshooting info.

## The DEBUG CONSOLE throws ClassNotFoundException
### Reason:
This error indicates your application attempts to reference some classes which are not found in the entire classpaths.

### Try:
1. Check whether you configure the required libraries in the dependency settings file (e.g. *pom.xml*).
2. Run VS Code command *"Java: Force Java compilation"* to force the language server to rebuild the current project.
3. If the problem persists, it's probably because the language server doesn't load your project correctly. Please reference the [language server troubleshooting](#try) paragraph for more troubleshooting info.

## Cannot find a class with the main method
### Reason:
When the `mainClass` is unconfigured in the *launch.json*, the debugger will resolve a class with main method automatically. This error indicates the debugger doesn't find any main class in the whole workspace.

### Try:
1. Check at least one main class exists in your workspace.
2. If no main class exists, please create a main class first. Otherwise, it's probably because the language server fails to start. Please reference the [language server troubleshooting](#try) paragraph for more troubleshooting info.

## Build failed, do you want to continue?
### Reason:
The error indicates your workspace has build errors. There are two kinds of build errors. One is compilation error for source code, the other is project error.

### Try:
1. Open VS Code PROBLEMS View, and fix the errors there.
2. If no errors are found in the PROBLEMS View, reference the [language server troubleshooting](#try) paragraph to update project configuration, and clean workspace cache.
