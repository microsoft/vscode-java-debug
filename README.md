# Debugger for Java

[![Gitter](https://badges.gitter.im/Microsoft/vscode-java-debug.svg)](https://gitter.im/Microsoft/vscode-java-debug)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/microsoft/vscode-java-debug/build.yml)](https://github.com/microsoft/vscode-java-debug/actions/workflows/build.yml?query=branch%3Amain)

## Overview
A lightweight Java Debugger based on [Java Debug Server](https://github.com/Microsoft/java-debug) which extends the [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java). It allows users to debug Java code using Visual Studio Code (VS Code). Here's a list of features:

- Launch/Attach
- Breakpoints/Conditional Breakpoints/Logpoints
- Exceptions
- Pause & Continue
- Step In/Out/Over
- Variables
- Callstacks
- Threads
- Debug console
- Evaluation
- Hot Code Replace

## Requirements
- JDK (version 1.8.0 or later)
- VS Code (version 1.19.0 or later)
- [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) (version 0.14.0 or later)

## Install

Open VS Code and press `F1` or `Ctrl + Shift + P` to open command palette, select **Install Extension** and type `vscode-java-debug`.

Or launch VS Code Quick Open (`Ctrl + P`), paste the following command, and press enter.
```bash
ext install vscode-java-debug
```

## Use

- Launch VS Code
- Open a Java project (Maven/Gradle/Eclipse/Single Java file)
- Open a Java file to activate the extensions
- Press `F5`

Please also check the documentation of [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) if you have trouble setting up your project.

## Options

### Launch

- `mainClass` - The fully qualified name of the class containing the main method. If not specified, the debugger automatically resolves the possible main class from current project.
  - `${file}` - Current Java file.
  - `com.mypackage.Main` - The fully qualified class name.
  - `com.java9.mymodule/com.mypackage.Main` - The fully qualified module name and class name.
  - `/path/to/Main.java` - The file path of the main class.
- `args` - The command line arguments passed to the program.
  - `"${command:SpecifyProgramArgs}"` - Prompt user for program arguments.
  - A space-separated string or an array of string.
- `sourcePaths` - The extra source directories of the program. The debugger looks for source code from project settings by default. This option allows the debugger to look for source code in extra directories.
- `modulePaths` - The modulepaths for launching the JVM. If not specified, the debugger will automatically resolve from current project. If multiple values are specified, the debugger will merge them together.
  - `$Auto` - Automatically resolve the modulepaths of current project.
  - `$Runtime` - The modulepaths within 'runtime' scope of current project.
  - `$Test` - The modulepaths within 'test' scope of current project.
  - `!/path/to/exclude` - Exclude the specified path from modulepaths.
  - `/path/to/append` - Append the specified path to the modulepaths.
- `classPaths` - The classpaths for launching the JVM. If not specified, the debugger will automatically resolve from current project. If multiple values are specified, the debugger will merge them together.
  - `$Auto` - Automatically resolve the classpaths of current project.
  - `$Runtime` - The classpaths within 'runtime' scope of current project.
  - `$Test` - The classpaths within 'test' scope of current project.
  - `!/path/to/exclude` - Exclude the specified path from classpaths.
  - `/path/to/append` - Append the specified path to the classpaths.
- `encoding` - The `file.encoding` setting for the JVM. Possible values can be found in https://docs.oracle.com/javase/8/docs/technotes/guides/intl/encoding.doc.html.
- `vmArgs` - The extra options and system properties for the JVM (e.g. -Xms\<size\> -Xmx\<size\> -D\<name\>=\<value\>), it accepts a string or an array of string.
- `projectName` - The preferred project in which the debugger searches for classes. There could be duplicated class names in different projects. This setting also works when the debugger looks for the specified main class when launching a program. It is required when the workspace has multiple java projects, otherwise the expression evaluation and conditional breakpoint may not work.
- `cwd` - The working directory of the program. Defaults to `${workspaceFolder}`.
- `env` - The extra environment variables for the program.
- `envFile` - Absolute path to a file containing environment variable definitions. Multiple files can be specified by providing an array of absolute paths
- `stopOnEntry` - Automatically pause the program after launching.
- `console` - The specified console to launch the program. If not specified, use the console specified by the `java.debug.settings.console` user setting.
  - `internalConsole` - VS Code debug console (input stream not supported).
  - `integratedTerminal` - VS Code integrated terminal.
  - `externalTerminal` - External terminal that can be configured in user settings.
- `shortenCommandLine` - When the project has long classpath or big VM arguments, the command line to launch the program may exceed the maximum command line string limitation allowed by the OS. This configuration item provides multiple approaches to shorten the command line. Defaults to `auto`.
  - `none` - Launch the program with the standard command line 'java [options] classname [args]'.
  - `jarmanifest` - Generate the classpath parameters to a temporary classpath.jar file, and launch the program with the command line 'java -cp classpath.jar classname [args]'.
  - `argfile` - Generate the classpath parameters to a temporary argument file, and launch the program with the command line 'java @argfile [args]'. This value only applies to Java 9 and higher.
  - `auto` - Automatically detect the command line length and determine whether to shorten the command line via an appropriate approach.
- `stepFilters` - Skip specified classes or methods when stepping.
  - `classNameFilters` - [**Deprecated** - replaced by `skipClasses`] Skip the specified classes when stepping. Class names should be fully qualified. Wildcard is supported.
  - `skipClasses` - Skip the specified classes when stepping.
    - `$JDK` - Skip the JDK classes from the default system bootstrap classpath, such as rt.jar, jrt-fs.jar.
    - `$Libraries` - Skip the classes from application libraries, such as Maven, Gradle dependencies.
    - `java.*` - Skip the specified classes. Wildcard is supported.
    - `java.lang.ClassLoader` - Skip the classloaders.
  - `skipSynthetics` - Skip synthetic methods when stepping.
  - `skipStaticInitializers` - Skip static initializer methods when stepping.
  - `skipConstructors` - Skip constructor methods when stepping.
- `javaExec` - The path to java executable to use. By default, the project JDK's java executable is used.

### Attach

- `hostName` (required, unless using `processId`) - The host name or IP address of remote debuggee.
- `port` (required, unless using `processId`) - The debug port of remote debuggee.
- `processId` - Use process picker to select a process to attach, or Process ID as integer.
  - `${command:PickJavaProcess}` - Use process picker to select a process to attach.
  - an integer pid - Attach to the specified local process.
- `timeout` - Timeout value before reconnecting, in milliseconds (default to 30000ms).
- `sourcePaths` - The extra source directories of the program. The debugger looks for source code from project settings by default. This option allows the debugger to look for source code in extra directories.
- `projectName` - The preferred project in which the debugger searches for classes. There could be duplicated class names in different projects. It is required when the workspace has multiple java projects, otherwise the expression evaluation and conditional breakpoint may not work.
- `stepFilters` - Skip specified classes or methods when stepping.
  - `classNameFilters` - [**Deprecated** - replaced by `skipClasses`] Skip the specified classes when stepping. Class names should be fully qualified. Wildcard is supported.
  - `skipClasses` - Skip the specified classes when stepping.
    - `$JDK` - Skip the JDK classes from the default system bootstrap classpath, such as rt.jar, jrt-fs.jar.
    - `$Libraries` - Skip the classes from application libraries, such as Maven, Gradle dependencies.
    - `java.*` - Skip the specified classes. Wildcard is supported.
    - `java.lang.ClassLoader` - Skip the classloaders.
  - `skipSynthetics` - Skip synthetic methods when stepping.
  - `skipStaticInitializers` - Skip static initializer methods when stepping.
  - `skipConstructors` - Skip constructor methods when stepping.

### User Settings

- `java.debug.logLevel`: minimum level of debugger logs that are sent to VS Code, defaults to `warn`.
- `java.debug.settings.showHex`: show numbers in hex format in "Variables" viewlet, defaults to `false`.
- `java.debug.settings.showStaticVariables`: show static variables in "Variables" viewlet, defaults to `false`.
- `java.debug.settings.showQualifiedNames`: show fully qualified class names in "Variables" viewlet, defaults to `false`.
- `java.debug.settings.showLogicalStructure`: show the logical structure for the Collection and Map classes in "Variables" viewlet, defaults to `true`.
- `java.debug.settings.showToString`: show 'toString()' value for all classes that override 'toString' method in "Variables" viewlet, defaults to `true`.
- `java.debug.settings.maxStringLength`: the maximum length of string displayed in "Variables" or "Debug Console" viewlet, the string longer than this length will be trimmed, defaults to `0` which means no trim is performed.
- `java.debug.settings.numericPrecision`: the precision when formatting doubles in "Variables" or "Debug Console" viewlet.
- `java.debug.settings.hotCodeReplace`: Reload the changed Java classes during debugging, defaults to `manual`. See the [wiki page](https://github.com/Microsoft/vscode-java-debug/wiki/Hot-Code-Replace) for more information about usages and limitations.
  - `manual` - Click the toolbar to apply the changes.
  - `auto` - Automatically apply the changes after compilation. This only works when `'java.autobuild.enabled'` is on.
  - `never` - Never apply the changes.
- `java.debug.settings.enableRunDebugCodeLens`: enable the code lens provider for the run and debug buttons over main entry points, defaults to `true`.
- `java.debug.settings.forceBuildBeforeLaunch`: force building the workspace before launching java program, defaults to `true`.
- `java.debug.settings.onBuildFailureProceed`: Force to proceed when build fails, defaults to false.
- `java.debug.settings.console`: The specified console to launch Java program, defaults to `integratedTerminal`. If you want to customize the console for a specific debug session, please modify the 'console' config in launch.json.
  - `internalConsole` - VS Code debug console (input stream not supported).
  - `integratedTerminal` - VS Code integrated terminal.
  - `externalTerminal` - External terminal that can be configured in user settings.
- `java.debug.settings.exceptionBreakpoint.exceptionTypes`: Specifies a set of exception types you want to break on, e.g. `java.lang.NullPointerException`. A specific exception type and its subclasses can be selected for caught exceptions, uncaught exceptions, or both can be selected.
- `java.debug.settings.exceptionBreakpoint.allowClasses`: Specifies the allowed locations where the exception breakpoint can break on. Wildcard is supported, e.g. `java.*`, `*.Foo`.
- `java.debug.settings.exceptionBreakpoint.skipClasses`: Skip the specified classes when breaking on exception.
  - `$JDK` - Skip the JDK classes from the default system bootstrap classpath, such as rt.jar, jrt-fs.jar.
  - `$Libraries` - Skip the classes from application libraries, such as Maven, Gradle dependencies.
  - `java.*` - Skip the specified classes. Wildcard is supported.
  - `java.lang.ClassLoader` - Skip the classloaders.
- `java.debug.settings.stepping.skipClasses`: Skip the specified classes when stepping.
  - `$JDK` - Skip the JDK classes from the default system bootstrap classpath, such as rt.jar, jrt-fs.jar.
  - `$Libraries` - Skip the classes from application libraries, such as Maven, Gradle dependencies.
  - `java.*` - Skip the specified classes. Wildcard is supported.
  - `java.lang.ClassLoader` - Skip the classloaders.
- `java.debug.settings.stepping.skipSynthetics`: Skip synthetic methods when stepping.
- `java.debug.settings.stepping.skipStaticInitializers`: Skip static initializer methods when stepping.
- `java.debug.settings.stepping.skipConstructors`: Skip constructor methods when stepping.
- `java.debug.settings.jdwp.limitOfVariablesPerJdwpRequest`: The maximum number of variables or fields that can be requested in one JDWP request. The higher the value, the less frequently debuggee will be requested when expanding the variable view. Also a large number can cause JDWP request timeout. Defaults to 100.
- `java.debug.settings.jdwp.requestTimeout`: The timeout (ms) of JDWP request when the debugger communicates with the target JVM. Defaults to 3000.
- `java.debug.settings.jdwp.async`: Experimental: Controls whether the debugger is allowed to send JDWP commands asynchronously. Async mode can improve remote debugging response speed on high-latency networks. Defaults to `auto`, and automatically switch to async mode when the latency of a single jdwp request exceeds 15ms during attach debugging.
  - `auto` (Default)
  - `on`
  - `off`
- `java.debug.settings.vmArgs`: The default VM arguments to launch the Java program. Eg. Use '-Xmx1G -ea' to increase the heap size to 1GB and enable assertions. If you want to customize the VM arguments for a specific debug session, please modify the 'vmArgs' config in launch.json.
- `java.debug.settings.debugSupportOnDecompiledSource`: [Experimental]: Enable debugging support on the decompiled source code. Be aware that this feature may affect the loading speed of Call Stack Viewlet. You also need [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java)@1.20.0 or higher to use this feature.
- `java.silentNotification`: Controls whether notifications can be used to report progress. If true, use status bar to report progress instead. Defaults to `false`.

> Pro Tip: The documentation [Configuration.md](https://github.com/microsoft/vscode-java-debug/blob/master/Configuration.md) provides lots of samples to demonstrate how to use these debug configurations, recommend to take a look.

## Troubleshooting
Reference the [Troubleshooting Guide](https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md) for common errors.  
Reference the [Troubleshooting Guide for Encoding Issues](https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting_encoding.md) for encoding issues.

## Contributing
If you are interested in fixing issues and contributing directly to the code base, please see the document [How to Contribute](https://github.com/microsoft/vscode-java-debug/blob/main/CONTRIBUTING.md).

## Feedback and Questions
You can find the full list of issues at [Issue Tracker](https://github.com/Microsoft/vscode-java-debug/issues). You can submit a [bug or feature suggestion](https://github.com/Microsoft/vscode-java-debug/issues/new), and participate community driven [![Gitter](https://badges.gitter.im/Microsoft/vscode-java-debug.svg)](https://gitter.im/Microsoft/vscode-java-debug)

## License
This extension is licensed under [MIT License](https://github.com/Microsoft/vscode-java-debug/blob/master/LICENSE.txt).

## Data/Telemetry
VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](https://go.microsoft.com/fwlink/?LinkID=528096&clcid=0x409) to learn more. If you don't wish to send usage data to Microsoft, you can set the `telemetry.telemetryLevel` setting to `"off"`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).
