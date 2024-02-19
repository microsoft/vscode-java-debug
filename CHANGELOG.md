# Change Log
All notable changes to the "vscode-java-debugger" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.56.1 - 2024-02-19
### Fixed
- Fix the java.lang.NoClassDefFoundError when triggering code completion in DEBUG CONSOLE. See [java-debug#534](https://github.com/microsoft/java-debug/issues/534).

## 0.56.0 - 2024-01-31
### Fixed
- Breakpoint doesn't work on lambdas which returns a generic type. See [java-debug#498](https://github.com/microsoft/java-debug/issues/498), [#1413](https://github.com/microsoft/vscode-java-debug/issues/1413) and [#1414](https://github.com/microsoft/vscode-java-debug/issues/1414).
- Breakpoint with inline lambdas work only with last one. See [#1410](https://github.com/microsoft/vscode-java-debug/issues/1410).
- StepInto method target doesn't work if the method is part of wrapped expression. See [java-debug#519](https://github.com/microsoft/java-debug/issues/519).

  Thanks to [Gayan Perera](https://github.com/gayanper) for contribution in fixing multiple bugs.

## 0.55.0 - 2023-11-01
### Changed
- Don't duplicate build reference projects when building a Gradle project managed by Build Server. [java-debug#511](https://github.com/microsoft/java-debug/pull/511).

### Fixed
- Cannot find Java process when using "Attach by Process ID". [#1388](https://github.com/microsoft/vscode-java-debug/issues/1388). Thanks to [owl-from-hogvarts](https://github.com/owl-from-hogvarts) for contribution.

## 0.54.0 - 2023-08-29
### Added
- Code completion in DEBUG CONSOLE now adds fully qualified names for unimported classes. See [#1246](https://github.com/microsoft/vscode-java-debug/issues/1246).
- Code completion in DEBUG CONSOLE now displays package names for suggested types. See [java-debug#505](https://github.com/microsoft/java-debug/pull/505).
- Integrate the build support for Gradle build server project. See [#1372](https://github.com/microsoft/vscode-java-debug/pull/1372), [java-debug#503](https://github.com/microsoft/java-debug/pull/503)

### Changed
- Respect the setting 'java.debug.settings.forceBuildBeforeLaunch' even if autobuild is disabled. See [#1380](https://github.com/microsoft/vscode-java-debug/pull/1380).

## 0.53.0 - 2023-08-01
### Added
- Automatically refresh the CALL STACK view when the attached sources for frames have changed. See [#1370](https://github.com/microsoft/vscode-java-debug/pull/1370).

### Changed
- Remove marketplace preview flag. See [#1369](https://github.com/microsoft/vscode-java-debug/pull/1369).

## 0.52.0 - 2023-06-30
### Added
- Use the setting `java.debug.settings.debugSupportOnDecompiledSource` to enable/disable debugging support on the decompiled source code. This feature requires [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java)@1.20.0 or higher. See [#1356](https://github.com/microsoft/vscode-java-debug/pull/1356).

## 0.51.0 - 2023-05-31
### Fixed
- NPE when adding lambda breakpoints in reactive projects. See [java-debug#477](https://github.com/microsoft/java-debug/issues/477). Thanks to [Gayan Perera](https://github.com/gayanper) for contribution.
- Lambda breakpoint on the first line of a method does not work. See [java-debug#488](https://github.com/microsoft/java-debug/issues/488). Thanks to [Gayan Perera](https://github.com/gayanper) for contribution.

## 0.50.0 - 2023-04-26
### Added
- Support specifying the exception types you want to break on. See [#1175](https://github.com/microsoft/vscode-java-debug/issues/1175) and [#295](https://github.com/microsoft/vscode-java-debug/issues/295).

## 0.49.1 - 2023-03-28
### Added
- Add context menus "Auto/Manual Expand Lazy Variables" to Variables view to auto show 'toString()' value. See [#1316](https://github.com/microsoft/vscode-java-debug/pull/1316).

### Fixed
- Fix the error 'compareVersions is not a function'. See [#1307](https://github.com/microsoft/vscode-java-debug/pull/1307).

## 0.49.0 - 2023-02-28
### Added
- Enable Hot Code Replace when autobuild is disabled. See [#1296](https://github.com/microsoft/vscode-java-debug/pull/1296), [#1302](https://github.com/microsoft/vscode-java-debug/pull/1302).

### Changed
- Display the running launch config name in progress bar for transparency. See [#1299](https://github.com/microsoft/vscode-java-debug/pull/1299).
- launch previously launched application if the current file isn't executable. See [#1036](https://github.com/microsoft/vscode-java-debug/issues/1036).

## 0.48.0 - 2023-02-01
### Changed
- Reject invalid DAP request. See [java-debug#466](https://github.com/microsoft/java-debug/pull/466).

### Fixed
- Prioritize lookup the project source code during debugging. See [#1215](https://github.com/microsoft/vscode-java-debug/issues/1215). Thanks to [mozhuanzuojing](https://github.com/mozhuanzuojing) for contribution.

## 0.47.0 - 2022-11-29
### Changed
- Optimize the build error report of "Build failed, do you want to continue?". [#1214](https://github.com/microsoft/vscode-java-debug/issues/1214).

### Fixed
- Use the system encoding to generate the *.argfile. [#1112](https://github.com/microsoft/vscode-java-debug/issues/1112).
- "shortenCommandLine": "argfile|auto" should include "vmArgs". [#1254](https://github.com/microsoft/vscode-java-debug/issues/1254).

## 0.46.0 - 2022-11-02
### Added
- Add "Step Into Target" feature to allow stepping directly into a specific function call when paused on a line. See [#1192](https://github.com/microsoft/vscode-java-debug/issues/1192). Thanks to [Gayan Perera](https://github.com/gayanper) for contribution.

### Changed
- Exclude **/node_modules/** from .vscode/launch.json searches. See [#1234](https://github.com/microsoft/vscode-java-debug/pull/1234). Thanks to [Brandon Cheng](https://github.com/gluxon) for contribution.

### Fixed
- Conditional Breakpoint got error code in reply:504. See [#1250](https://github.com/microsoft/vscode-java-debug/issues/1250).

## 0.45.0 - 2022-10-12
### Added
- Visualize the inline breakpoint locations. See [#1193](https://github.com/microsoft/vscode-java-debug/issues/1193).
- Show an extra column cursor when an inline breakpoint is hit. See [#1202](https://github.com/microsoft/vscode-java-debug/issues/1202).
- Support JEP 425: Virtual Threads (JDK 19). See [#1159](https://github.com/microsoft/vscode-java-debug/issues/1159).

### Changed
- Enable async jdwp based on network latency for auto mode. See [java-debug#447](https://github.com/microsoft/java-debug/pull/447).

### Fixed
- NPE when stopping JDT.LS. See [java-debug#448](https://github.com/microsoft/java-debug/issues/448).

## 0.44.0 - 2022-09-01
### Added
- **Experimental**: Support processing JDWP commands asynchronously to improve response speed of remote debugging. It's only enabled by default on VS Code Insiders. You can also opt-in by setting `java.debug.settings.jdwp.async`. See [#1208](https://github.com/microsoft/vscode-java-debug/pull/1208) and [java-debug#436](https://github.com/microsoft/java-debug/pull/436).
- Add support to specify Java executable via the property `javaExec` in launch.json. See [#1198](https://github.com/microsoft/vscode-java-debug/pull/1198). Thanks to [Gayan Perera](https://github.com/gayanper) for contribution.
- Add support for lambda breakpoints. See [java-debug#427](https://github.com/microsoft/java-debug/pull/427). Thanks to [Gayan Perera](https://github.com/gayanper) for contribution.

## 0.43.0 - 2022-07-27
### Added
- Support adding function breakpoints from the editor gutter. [java-debug#426](https://github.com/microsoft/java-debug/pull/426). Thanks to [Gayan Perera](https://github.com/gayanper) for contribution.

### Changed
- Show target VM exceptions as result in evaluate requests. [java-debug#428](https://github.com/microsoft/java-debug/pull/428). Thanks to [Mathias Fußenegger](https://github.com/mfussenegger) for contribution.

## 0.42.0 - 2022-06-29
### Added
- Support function breakpoints, see [#258](https://github.com/microsoft/vscode-java-debug/issues/258). The current version support adding a function breakpoint with the syntax as `FullyQualifiedClassName#methodName` (e.g. `java.util.ArrayList#add`). Thanks to [Gayan Perera](https://github.com/gayanper) for contribution.

### Changed
- Mark native frames and unavailable methods as subtle. [java-debug#409](https://github.com/microsoft/java-debug/pull/409). Thanks to [Mathias Fußenegger](https://github.com/mfussenegger) for contribution.

### Fixed
- fix artifactId typo in Troubleshooting.md. [#1180](https://github.com/microsoft/vscode-java-debug/pull/1180). Thanks to [btoo](https://github.com/btoo) for contribution.

## 0.41.0- 2022-06-01
### Added
- Provide "Stop Java" button when triggering "Run Java" action. [#1166](https://github.com/microsoft/vscode-java-debug/issues/1166).
- [API] Support DAP request `processId` and event `processid` to get the exact pid of current running Java process. [java-debug#413](https://github.com/microsoft/java-debug/pull/413).

### Changed
- Naming Java terminals with different names. [#1164](https://github.com/microsoft/vscode-java-debug/issues/1164).
- Enable Java terminal link provider on all terminals. [#1168](https://github.com/microsoft/vscode-java-debug/pull/1168).
- Disable HCR button when running Java without debugging. [#1167](https://github.com/microsoft/vscode-java-debug/pull/1167).

## 0.40.1- 2022-04-15
### Fixed
- Update command id to 'java.project.addToSourcePath.command'. [#1152](https://github.com/microsoft/vscode-java-debug/issues/1152).

## 0.40.0 - 2022-03-28
### Fixed
- Fix extension version. [#1146](https://github.com/microsoft/vscode-java-debug/pull/1146).

## 0.39.0 - 2022-03-28
### Added
- Support lazy loading object values from toString(). [java-debug#401](https://github.com/microsoft/java-debug/pull/401).
- API - Provide an api to query the processId of the debugging Java process. [java-debug#399](https://github.com/microsoft/java-debug/pull/399).

### Changed
- Print logpoints to debug console. [#710](https://github.com/microsoft/vscode-java-debug/issues/710). Thanks to [James Clark](https://github.com/sbj42) for contribution.

### Fixed
- VM launch failure doesn't report a useful error. [java-debug#397](https://github.com/microsoft/java-debug/issues/397). Thanks to [Karl von Randow](https://github.com/karlvr) for contribution.
- Engineering - Fix problemMatcher patterns for the watch task. [#1137](https://github.com/microsoft/vscode-java-debug/pull/1137). Thanks to [James Clark](https://github.com/sbj42) for contribution. 

## 0.38.0 - 2022-01-26
### Added
- Thanks for the contribution from [Mu-Tsun Tsai](https://github.com/MuTsunTsai). Add zh-tw locale. [#1087](https://github.com/microsoft/vscode-java-debug/pull/1087).

### Changed
- Change the inline button to debug icon. [#1108](https://github.com/microsoft/vscode-java-debug/pull/1108).

### Fixed
- Improve the search performance of resolving main class. [java-debug#395](https://github.com/microsoft/java-debug/pull/395).
- If mainClass not specified, it will find main classes not belonging to current workspace. [#1098](https://github.com/microsoft/vscode-java-debug/issues/1098).
- Update CONTRIBUTING docs. [#1105](https://github.com/microsoft/vscode-java-debug/issues/1105).

## 0.37.0 - 2021-11-24
### Added
- Troubleshooting Guide for Encoding Issues on Windows. See [Troubleshooting_encoding](https://github.com/microsoft/vscode-java-debug/blob/main/Troubleshooting_encoding.md).

### Fixed
- Address encoding issues on Windows. [#1077](https://github.com/microsoft/vscode-java-debug/pull/1077).
- Encoding - launcher.bat could not pass on redirected input into the java program being debugged. [microsoft/vscode-java-pack#756](https://github.com/microsoft/vscode-java-pack/issues/756).
- Encoding - Launching BAT for UTF-8 fix is incompatible with Security Policies disallowing BAT execution. [#646](https://github.com/microsoft/vscode-java-debug/issues/646).
- Encoding - Non-ASCII char support for Windows terminals. [#622](https://github.com/microsoft/vscode-java-debug/issues/622).
- Encoding - [Windows non-ASCII folder] Error: Could not find or load main class. [#623](https://github.com/microsoft/vscode-java-debug/issues/623).
- Step filter in the settings.json is not working. [#1085](https://github.com/microsoft/vscode-java-debug/issues/1085).
- Contribution from [
John Grant](https://github.com/cyrfer): Support multiline values in envFile. [#1061](https://github.com/microsoft/vscode-java-debug/issues/1061).
- Contribution from [
Adrien Piquerez](https://github.com/adpi2). Fix NPE when using step filter. [microsoft/java-debug#387](https://github.com/microsoft/java-debug/pull/387).
- Contribution from [Douglas M. Barcellos](https://github.com/dougmbarcellos). Update telemetry setting declaration in README. [#1084](https://github.com/microsoft/vscode-java-debug/pull/1084).

## 0.36.0 - 2021-09-23
### Changed
- Adopt new createStatusBarItem API for id and name properties. [#1020](https://github.com/microsoft/vscode-java-debug/issues/1020).

### Fixed
- Unicode character in class name will fail to run. [#780](https://github.com/microsoft/vscode-java-debug/issues/780).
- Launching apps which require both a modulepath and a classpath doesn't work with shortenCommandLine="argfile". [#1047](https://github.com/microsoft/vscode-java-debug/issues/1047).
- Debugger fails to load variable values due to java.lang.OutOfMemoryError. [#1044](https://github.com/microsoft/vscode-java-debug/issues/1044).
- Fix privacy in the logger. [PR#1048](https://github.com/microsoft/vscode-java-debug/pull/1048).

## 0.35.0 - 2021-07-28
### Changed
- Add link to check detatils while reporting debugging progress. [PR#1034](https://github.com/microsoft/vscode-java-debug/pull/1034).

### Fixed
- Catch up build errors before running a Java application. [#949](https://github.com/microsoft/vscode-java-debug/issues/949).

## 0.34.0 - 2021-05-26
### Changed
- Allow customizing the "classPaths" and "modulePaths" configurations via launch.json. See [#93](https://github.com/microsoft/vscode-java-debug/issues/93), [#980](https://github.com/microsoft/vscode-java-debug/issues/980).

## 0.33.1 - 2021-04-30
### Fixed
- HotFix: After upgrade from vscode-java v0.77.0 to v0.78.0 can't debug tests. [#995](https://github.com/microsoft/vscode-java-debug/issues/995).

## 0.33.0 - 2021-04-28
### Added
- Support inline values feature. [PR#977](https://github.com/microsoft/vscode-java-debug/pull/977).
- Show VARIABLES with different data views. [PR#982](https://github.com/microsoft/vscode-java-debug/pull/982).
- Adopt new APIs from vscode-tas-client. [#974](https://github.com/microsoft/vscode-java-debug/pull/974).
- Adopt workspaceTrust in package.json. [PR#988](https://github.com/microsoft/vscode-java-debug/pull/988).

### Changed
- Engineering: Clean up deprecated logs. [PR#987](https://github.com/microsoft/vscode-java-debug/pull/987).

### Fixed
- Breakpoints inside record methods don't work. [#973](https://github.com/microsoft/vscode-java-debug/issues/973).
- Support environment variable for port number in launch.json debug configuration. [#962](https://github.com/microsoft/vscode-java-debug/issues/962).
- Thanks for the contribution from [ZingBlue](https://github.com/ZingBlue): Spelling fix. [#968](https://github.com/microsoft/vscode-java-debug/pull/968).

## 0.32.1 - 2021-03-23
### Fixed
- Cannot launch debug session using JDK 16. [#970](https://github.com/microsoft/vscode-java-debug/issues/970).

## 0.32.0 - 2021-03-12
### Added
- Adopt TAS client for A/B testing. [PR#959](https://github.com/microsoft/vscode-java-debug/pull/959).

### Changed
- Update to new product logo. [PR#952](https://github.com/microsoft/vscode-java-debug/pull/952).
- Adopt new 'run' menu in editor title. [PR#956](https://github.com/microsoft/vscode-java-debug/pull/956),[PR#960](https://github.com/microsoft/vscode-java-debug/pull/960).
- Engineering - Enable GitHub Actions. [PR#951](https://github.com/microsoft/vscode-java-debug/pull/951).

## 0.31.0 - 2021-02-02
### Added
- Support envFile option in launch.json. [#523](https://github.com/microsoft/vscode-java-debug/issues/523).

### Fixed
- Git bash failed to execute Run/Debug when Windows username have blank space. [#678](https://github.com/microsoft/vscode-java-debug/issues/678).
- TEMP folder with spaces breaks debugger process. [#822](https://github.com/microsoft/vscode-java-debug/issues/822).
- The sort of completion list in DEBUG CONSOLE is different from that in editor. [#909](https://github.com/microsoft/vscode-java-debug/issues/909).
- The program failed to run in terminal if clicking run button several times in succession. [#924](https://github.com/microsoft/vscode-java-debug/issues/924).
- Fix vulnerabilities. [#935](https://github.com/microsoft/vscode-java-debug/issues/935), [#936](https://github.com/microsoft/vscode-java-debug/issues/936).

## 0.30.0 - 2020-12-16
### Added
- Add run button as inline button in Java Project Explorer. [PR#900](https://github.com/microsoft/vscode-java-debug/pull/900).
- Use progress to hint the current build status whenever you trigger the Run and Debug features. [PR#919](https://github.com/microsoft/vscode-java-debug/pull/919).
- Thanks for the contribution from [pablojimpas](https://github.com/pablojimpas): Spanish localization support. [PR#904](https://github.com/microsoft/vscode-java-debug/pull/904).

### Changed
- Make the run buttons in editor toolbar more context-aware. [PR#898](https://github.com/microsoft/vscode-java-debug/pull/898).
- Update the group name of the Run and Debug menus registered in the Java Project Explorer. [PR#908](https://github.com/microsoft/vscode-java-debug/pull/908).
- Simplify the name label of the launch configuration. [PR#921](https://github.com/microsoft/vscode-java-debug/pull/921).
- Debt: Enable more tslint rules. [PR#914](https://github.com/microsoft/vscode-java-debug/pull/914),[PR#918](https://github.com/microsoft/vscode-java-debug/pull/918).

### Fixed
- Find Java version from release file. [#910](https://github.com/microsoft/vscode-java-debug/issues/910).

## 0.29.0 - 2020-10-16
### Added
- Jump to source when clicking the stack trace printed to the terminal. [PR#890](https://github.com/microsoft/vscode-java-debug/pull/890).
- Contribute `Run` and `Debug` menus to Project Explorer. [#878](https://github.com/microsoft/vscode-java-debug/pull/878).
- Provide a user setting `java.debug.settings.vmArgs` to set the default VM arguments to launch your program. [#220](https://github.com/microsoft/vscode-java-debug/issues/220),[#876](https://github.com/microsoft/vscode-java-debug/issues/876).
- Provide a user setting `java.debug.settings.onBuildFailureProceed` to force the debug session to proceed when build fails. [#888](https://github.com/microsoft/vscode-java-debug/issues/888).

### Changed
- Allow cancelling the outdated codelens job. [PR#881](https://github.com/microsoft/vscode-java-debug/pull/881).

### Fixed
- Fix the wrong auto-completion result when typing the evaluation expression in DEBUG CONSOLE. [#880](https://github.com/microsoft/vscode-java-debug/issues/880).
- Fix the error 'UNC path is missing sharename: \\\\java'. [#882](https://github.com/microsoft/vscode-java-debug/issues/882).
- Use the correct runtime to validate the JVM versions between the debugger and debuggee. [PR#353](https://github.com/microsoft/java-debug/pull/353).

## 0.28.0 - 2020-08-27
### Added
- Add run/debug buttons to editor title bar for single file debugging. [#834](https://github.com/microsoft/vscode-java-debug/issues/834).
- Add user settings `java.debug.settings.jdwp.limitOfVariablesPerJdwpRequest` and `java.debug.settings.jdwp.requestTimeout` to control JDWP request. [#862](https://github.com/microsoft/vscode-java-debug/pull/862),[#863](https://github.com/microsoft/vscode-java-debug/pull/863).

### Changed
- Reduce the frequency of JDWP requests to improve performance when expanding VARIABLES view. [#347](https://github.com/microsoft/java-debug/pull/347).
- Migrate the legacy log to the telemetry wrapper. [#866](https://github.com/microsoft/vscode-java-debug/pull/866).

### Fixed
- Fix Hot Code Replace error "Cannot find any changed classes for hot replace!". [#855](https://github.com/microsoft/vscode-java-debug/issues/855).

## 0.27.1 - 2020-07-21
### Fixed
- Hot Code Replace always reports "Cannot find any changed classes for hot replace!". [#850](https://github.com/microsoft/vscode-java-debug/issues/850).

## 0.27.0 - 2020-07-17
### Added
- Break on exception for "just my code". [#756](https://github.com/microsoft/vscode-java-debug/issues/756).
- Support step "just my code". [#628](https://github.com/microsoft/vscode-java-debug/issues/628).
- Show return value of a method. [#660](https://github.com/microsoft/vscode-java-debug/issues/660).
- Support "copy value" from Variable viewlet. [#819](https://github.com/microsoft/vscode-java-debug/issues/819).
- From upstream jdt: support using lambda and reference expressions in debug evaluation. [#281](https://github.com/microsoft/vscode-java-debug/issues/281).
- From upstream jdt: support evaluating local variables in the lambda body. [#754](https://github.com/microsoft/vscode-java-debug/issues/754).

### Changed
- Always give UI feedback whenever you click ⚡ button to apply code changes. [#833](https://github.com/microsoft/vscode-java-debug/pull/833).
- Automatically add -XX:+ShowCodeDetailsInExceptionMessages when launching your program with Java 14. [#797](https://github.com/microsoft/vscode-java-debug/issues/797).
- Adopt the new resolveVariable API. [#750](https://github.com/microsoft/vscode-java-debug/issues/750).
- Adopt DebugAdapterDescriptorFactor API. [#751](https://github.com/microsoft/vscode-java-debug/issues/751).

### Fixed
- Give a response when you trigger debugging in LightWeight mode. [#841](https://github.com/microsoft/vscode-java-debug/issues/841).
- Failed to get variables. Reason: com.sun.jdi.InvalidStackFrameException. [#767](https://github.com/microsoft/vscode-java-debug/issues/767).
- Render the source link for stack trace from Java modules. [#824](https://github.com/microsoft/vscode-java-debug/issues/824).

## 0.26.0 - 2020-05-13
### Added
- Support picking a Java process to auto attach. [#759](https://github.com/microsoft/vscode-java-debug/issues/759).

### Fixed
- When running the Gradle application, the test scope is not filtered out. [#715](https://github.com/microsoft/vscode-java-debug/issues/715).
- Conditional breakpoint fails in the multi thread scenario. [#782](https://github.com/microsoft/vscode-java-debug/issues/782).
- Show a warning message about the Unsupported JDK error. [#789](https://github.com/microsoft/vscode-java-debug/issues/789).
- vmArgs in launch.json does not accept an array of strings. [#778](https://github.com/microsoft/vscode-java-debug/issues/778).
- Activate the extension before execute Java extension commands. [#775](https://github.com/microsoft/vscode-java-debug/pull/775).

### Changed
- Contribution from [Mathias Fußenegger](https://github.com/mfussenegger): Extend readme with basic low level usage instructions. [java-debug#327](https://github.com/microsoft/java-debug/pull/327).

Thank [Mathias Fußenegger](https://github.com/mfussenegger) for contribution.

## 0.25.1 - 2020-03-06
### Fixed
- Fix the Error: Could not find or load main class @x.y.z.argfile. [#769](https://github.com/microsoft/vscode-java-debug/issues/769).
- Cannot hit breakpoint at the class using Java 13 Text Blocks. [#773](https://github.com/microsoft/vscode-java-debug/issues/773).

## 0.25.0 - 2020-02-20
### Added
- Provide context menu to continue/pause all/other threads. [#748](https://github.com/microsoft/vscode-java-debug/pull/748).
- Contribution from [bhoppeadoy](https://github.com/bhoppeadoy): Add user setting `java.debug.settings.numericPrecision` to set the numeric precision when formatting doubles in "Variables" or "Debug Console" viewlet. [#745](https://github.com/microsoft/vscode-java-debug/issues/745).

### Fixed
- Use project's Java runtime to launch the application. [#753](https://github.com/microsoft/vscode-java-debug/issues/753).
- Restart stop but not start the program. [#752](https://github.com/microsoft/vscode-java-debug/issues/752).
- Contribution from [xiaoyinl](https://github.com/xiaoyinl): Use HTTPS wherever possible. [#732](https://github.com/microsoft/vscode-java-debug/pull/732).

## 0.24.0 - 2019-12-25
### Added
- Support breaking when value changes (a.k.a. Data Breakpoints). [#654](https://github.com/microsoft/vscode-java-debug/issues/654).

### Changed
- Improve "Run Java" experience: `F5` will run the current file without generating launch.json. [#724](https://github.com/microsoft/vscode-java-debug/issues/724).

### Fixed
- Debug console will hang on Java exception stack trace. [#719](https://github.com/microsoft/vscode-java-debug/issues/719).
- Debug console won't automatically append `()` if selecting a method in completion list. [#711](https://github.com/microsoft/vscode-java-debug/issues/711), [#691](https://github.com/microsoft/vscode-java-debug/issues/691).
- Cannot pass `vmArgs` array to Java 13 project. [#703](https://github.com/microsoft/vscode-java-debug/issues/703).

## 0.23.0 - 2019-10-29
### Added
- Provide "Fix..." suggestions when "Build failed" occurs during launching the application. [#358](https://github.com/microsoft/vscode-java-debug/issues/358).
- Prompt to add the folder to source path if the running file isn't on classpath. [#470](https://github.com/microsoft/vscode-java-debug/issues/470).
- Provide samples for the commonly used debug configuration. See the [doc](https://github.com/microsoft/vscode-java-debug/blob/master/Configuration.md).

### Fixed
- It's safe to keep running the run/debug codelens if the debug configuration fails to save into the launch.json. [PR#673](https://github.com/microsoft/vscode-java-debug/pull/673).
- Improve the error handling when running the file via the context "run" or "debug" menu. [PR#679](https://github.com/microsoft/vscode-java-debug/pull/679).
- Support searching main classes from the workspace invisible project. [PR#305](https://github.com/microsoft/java-debug/pull/305).

### Changed
- Update troubleshooting doc for class not found error. See the [doc](https://github.com/microsoft/vscode-java-debug/blob/master/Troubleshooting.md#program-error-could-not-find-or-load-main-class-x).
- Update troubleshooting doc for build failed error. See the [doc](https://github.com/microsoft/vscode-java-debug/blob/master/Troubleshooting.md#build-failed-do-you-want-to-continue).

## 0.22.0 - 2019-09-24
### Added
- Show Run/Debug buttons when hover on a main method. [#657](https://github.com/microsoft/vscode-java-debug/issues/657).

### Fixed
- Debugger just broken with git bash as the default shell on Windows. [#642](https://github.com/microsoft/vscode-java-debug/issues/642).
- [Mac] Failed to launch debuggee in terminal with TimeoutException. [#637](https://github.com/microsoft/vscode-java-debug/issues/637), [#651](https://github.com/microsoft/vscode-java-debug/issues/651).
- Pop an error message when click ⚡ HCR button in the Run mode. [PR#665](https://github.com/microsoft/vscode-java-debug/pull/665).
- Don't escape single quote of the program args. [PR#668](https://github.com/microsoft/vscode-java-debug/pull/668).

## 0.21.0 - 2019-08-26
### Added
- Add menu entries to `Run` and `Debug` a Java application when you right click a Java file in file explorer or opened editor. [#626](https://github.com/microsoft/vscode-java-debug/issues/626).

### Changed
- Remove hard dependency of redhat.java. [PR#617](https://github.com/microsoft/vscode-java-debug/pull/617).
- Change the default console to integrated terminal. [#605](https://github.com/microsoft/vscode-java-debug/issues/605).

### Fixed
- Java language server is activated by mistake when debugging a non-Java project. [#238](https://github.com/microsoft/vscode-java-debug/issues/238).
- [Windows] `integratedTerminal` console does not showing unicode characters. [#524](https://github.com/microsoft/vscode-java-debug/issues/524).
- Contribution from [pi1024e](https://github.com/pi1024e): Fix UI typos. [PR#630](https://github.com/microsoft/vscode-java-debug/pull/630).

Thank [pi1024e](https://github.com/pi1024e) for contribution.

## 0.20.0 - 2019-07-01
### Fixed
- Fix: Adding wrong jar version to the classpath. [#566](https://github.com/microsoft/vscode-java-debug/issues/566).
- Fix: Adding wrong classpath at runtime for multi modules maven projects. [#584](https://github.com/microsoft/vscode-java-debug/issues/584).
- Contribution from [tom-shan](https://github.com/tom-shan): Should break earlier when destroying temporary launch file. [PR#280](https://github.com/microsoft/java-debug/pull/280).

Thank [tom-shan](https://github.com/tom-shan) for contribution.

## 0.19.0 - 2019-05-31
### Added
- Add a debug toolbar button to apply the changed classes to the running application. [#559](https://github.com/microsoft/vscode-java-debug/issues/559). 
- Show toString() values in Variable window and hover tooltip. [#315](https://github.com/microsoft/vscode-java-debug/issues/315), [#364](https://github.com/microsoft/vscode-java-debug/issues/364).
- Add a global user setting `java.debug.settings.console` to specify the default console to launch your program. [PR#594](https://github.com/microsoft/vscode-java-debug/pull/594).

### Fixed
- Fix: The debug toolbar doesn't close after the program running in external terminal exits. [#582](https://github.com/microsoft/vscode-java-debug/issues/582).
- Fix: Cannot stop the debugging process automatically in attach mode. [java-debug#273](https://github.com/microsoft/java-debug/issues/273).

## 0.18.0 - 2019-04-23
### Added
- Enable "Logical Structure" view for Map and Collection variables. [#227](https://github.com/Microsoft/vscode-java-debug/issues/227).
- Add the source hyperlinks for the stack traces in the Debug Console output. [#490](https://github.com/Microsoft/vscode-java-debug/issues/490), [#506](https://github.com/Microsoft/vscode-java-debug/issues/506).
- Automatically add `--enable-preview` to vmArgs when necessary. [#553](https://github.com/Microsoft/vscode-java-debug/issues/553).

### Changed
- Disable `java.debug.settings.showStaticVariables` by default to not show the static fields.

### Fixed
- Fix: Debug Console does not support autocomplete when a .class file is open. [#535](https://github.com/Microsoft/vscode-java-debug/issues/535).

## 0.17.0 - 2019-03-06
### Added
- Popup the exception details via a UI widget when an exception breakpoint is hit. [#522](https://github.com/Microsoft/vscode-java-debug/issues/522).

### Changed
- Reduce the extension load time by using webpack. [#492](https://github.com/Microsoft/vscode-java-debug/issues/492), [#517](https://github.com/Microsoft/vscode-java-debug/issues/517).

### Fixed
- Add a new debug configuration `shortenCommandLine` to fix the issue "CreateProcess error=206, The filename or extension is too long". [#110](https://github.com/Microsoft/vscode-java-debug/issues/110).

## 0.16.0 - 2018-12-12
### Added
- Provide Chinese localized settings page for Java debugger, including launch.json configuration and user settings. [#472](https://github.com/Microsoft/vscode-java-debug/issues/472), [#477](https://github.com/Microsoft/vscode-java-debug/issues/477).
- Add new user settings `java.debug.settings.forceBuildBeforeLaunch` to control whether to build the workspace before Run/Debug. [#462](https://github.com/Microsoft/vscode-java-debug/issues/462).
- F5 will auto launch the current Java file if `mainClass` in launch.json is set to the variable `${file}`. [#431](https://github.com/Microsoft/vscode-java-debug/issues/431)

### Changed
- Simplify generated launch.json. [#476](https://github.com/Microsoft/vscode-java-debug/issues/476).
- Remove the emoji before Run/Debug CodeLens. [#475](https://github.com/Microsoft/vscode-java-debug/issues/475).
- Use `vscode.open` api instead of `opn` library. [#479](https://github.com/Microsoft/vscode-java-debug/issues/479).

### Fixed
- Fix the main class isn't unique issue. [#420](https://github.com/Microsoft/vscode-java-debug/issues/420).

## 0.15.0 - 2018-11-01
### Added
- Contribution from [Thad House](https://github.com/ThadHouse): Add new user settings `java.debug.settings.enableRunDebugCodeLens` to enable/disable Run|Debug Code Lenses on main methods. [#464](https://github.com/Microsoft/vscode-java-debug/issues/464).
- Contribution from [Julien Russo](https://github.com/Dotpys): Add italian translation for extension configuration. [PR#463](https://github.com/Microsoft/vscode-java-debug/pull/463).

Thank [Thad House](https://github.com/ThadHouse) and [Julien Russo](https://github.com/Dotpys) for contribution.

## 0.14.0 - 2018-10-10
### Fixed
- Fix: Code Lenses for Run/Debug links on main methods don't show up immediately. [#438](https://github.com/Microsoft/vscode-java-debug/issues/438).
- Fix: It throws "ConfigError: 'mymodule/App' is not a valid class name." for java 9 program. [#437](https://github.com/Microsoft/vscode-java-debug/issues/437).
- Fix: Cannot run from src/test anymore. [#413](https://github.com/Microsoft/vscode-java-debug/issues/413).
- Fix: It throws InvalidStackFrameException during evaluating on conditional breakpoint. [#369](https://github.com/Microsoft/vscode-java-debug/issues/369).
- Fix: The launch command for internalConsole is different from integratedTerminal. [#440](https://github.com/Microsoft/vscode-java-debug/issues/440).

## 0.13.0 - 2018-9-19
### Added
- Use code lens to run java program in a much simpler way. [#375](https://github.com/Microsoft/vscode-java-debug/issues/375).
- Make args/vmArgs accept an array. [#389](https://github.com/Microsoft/vscode-java-debug/issues/389).
- Make mainClass accept variables. [#85](https://github.com/Microsoft/vscode-java-debug/issues/85).

### Fixed
- Fix: Still include test classes in classpaths when auto resolve maven project. [#378](https://github.com/Microsoft/vscode-java-debug/issues/378).
- Fix: Duplicate class path during launching. [#370](https://github.com/Microsoft/vscode-java-debug/issues/370).
- Fix: Update Active Editor oct icon to file instead of clock. [#403](https://github.com/Microsoft/vscode-java-debug/issues/403).
- Fix: Launching the debuggee with the same JDK as java language server instead of JRE. [#366](https://github.com/Microsoft/vscode-java-debug/issues/366).
- Fix: Avoid pop up error window many times for logpoints in a loop. [#360](https://github.com/Microsoft/vscode-java-debug/issues/390).
- Fix: Debug buttons disabled. [#411](https://github.com/Microsoft/vscode-java-debug/issues/411)
- Fix: StepResponse/ContinueResponse should be sent before StoppedEvent. [java-debug#134](https://github.com/Microsoft/java-debug/issues/134)

## 0.12.2 - 2018-9-6
### Fixed
- Fix: Runtime scope class path entries are missing. [#402](https://github.com/Microsoft/vscode-java-debug/issues/402).

## 0.12.1 - 2018-8-31
### Fixed
- Fix: `env` config in launch.json not respected. [#393](https://github.com/Microsoft/vscode-java-debug/issues/393).

## 0.12.0 - 2018-8-29
### Added
- Start without debugging. See [#351](https://github.com/Microsoft/vscode-java-debug/issues/351).
- Add the validation to mainClass and projectName before launching. See [#355](https://github.com/Microsoft/vscode-java-debug/issues/355).
- Add "Learn More" link jumps to the associated troubleshooting paragraph [#360](https://github.com/Microsoft/vscode-java-debug/issues/360).

### Changed
- Put recently used main class in the top [#350](https://github.com/Microsoft/vscode-java-debug/issues/350).
- Enable evaluation for hovers [#297](https://github.com/Microsoft/vscode-java-debug/issues/297).
- Distinguish user errors and system errors [#288](https://github.com/Microsoft/vscode-java-debug/issues/288).

### Fixed
- Fix: vulnerabilities issue [PR#356](https://github.com/Microsoft/vscode-java-debug/pull/356).
- Fix: NPE for CompletionsProvider [PR#206](https://github.com/Microsoft/java-debug/pull/206).
- Fix: Debugger slow when watching variables [#305](https://github.com/Microsoft/vscode-java-debug/issues/305).
- Fix: Should not include test classes in classpath [#111](https://github.com/Microsoft/vscode-java-debug/issues/111).

## 0.11.0 - 2018-8-2
### Added
- Add a troubleshooting page for common errors. See [the troubleshooting guide](https://github.com/Microsoft/vscode-java-debug/blob/master/Troubleshooting.md).
- Build and publish the Java Debug Server plugin as p2 artifacts. See [PR#191](https://github.com/Microsoft/java-debug/pull/191), [PR#192](https://github.com/Microsoft/java-debug/pull/192).

### Changed
- Auto select Java Debugger for .java file. See [PR#329](https://github.com/Microsoft/vscode-java-debug/pull/329).
- Improve the *launch.json* auto-generation UX. See [PR#342](https://github.com/Microsoft/vscode-java-debug/pull/342).
- Improve the logger coverage for the error response. See [PR#190](https://github.com/Microsoft/java-debug/pull/190).

### Fixed
- Fix the attach error in JDK 10. See [PR#187](https://github.com/Microsoft/java-debug/pull/187).
- Fix the Java Debug Server plugin build error in JDK 10. See [PR#194](https://github.com/Microsoft/java-debug/pull/194).

## 0.10.0 - 2018-6-27
### Added
- Add support for Logpoint. The minimum compatible VS Code version is 1.22. See the feature request [#272](https://github.com/Microsoft/vscode-java-debug/issues/272)

### Fixed
- Contribution from [LunarArcanus](https://github.com/LunarArcanus): Fix the grammar issue in README. See [PR#306](https://github.com/Microsoft/vscode-java-debug/pull/306).
- Fix the project's build errors in JDK 9/10. See [PR#178](https://github.com/Microsoft/java-debug/pull/178)

## 0.9.0 - 2018-4-26
### Added
- Support auto-complete feature in debug console view. See the feature request [#237](https://github.com/Microsoft/vscode-java-debug/issues/237)

### Fixed
- Fix the ObjectCollectedException when enabling ExceptionBreakpoint. See [Issue #182](https://github.com/Microsoft/vscode-java-debug/issues/182)
- Fix the [issue #277](https://github.com/Microsoft/vscode-java-debug/issues/277) that the debugger doesn't stop on caught/uncaught exceptions. See [PR #172](https://github.com/Microsoft/java-debug/pull/172)
- Fix the [issue #273](https://github.com/Microsoft/vscode-java-debug/issues/273) that Chinese characters directory will cause messy code during stack trace's source looking up. See [PR #170](https://github.com/Microsoft/java-debug/pull/170)


## 0.8.0 - 2018-4-3
### Added
- Support [restart frame](https://github.com/Microsoft/vscode-java-debug/issues/235). See [PR#160](https://github.com/Microsoft/java-debug/pull/160)

### Changed
- Enable hot code replace by default. See [PR#263](https://github.com/Microsoft/vscode-java-debug/pull/263)
- Wait for building successfully before launch debug session. See [PR#257](https://github.com/Microsoft/vscode-java-debug/pull/257)
- Automatically detect projectName when only one main class or project available.  See [PR#164](https://github.com/Microsoft/java-debug/pull/164)


## 0.7.0 - 2018-3-15
### Added
- Support [conditional breakpoints](https://github.com/Microsoft/vscode-java-debug/issues/118). See [PR#153](https://github.com/Microsoft/java-debug/pull/153), [PR#154](https://github.com/Microsoft/java-debug/pull/154), [PR#156](https://github.com/Microsoft/java-debug/pull/156)
- Support prompting user for program arguments. See [PR#245](https://github.com/Microsoft/vscode-java-debug/pull/245)

### Changed
- Fix the unsupported breakpoint at method entry/exit issue. See [PR#129](https://github.com/Microsoft/java-debug/pull/129)
- Fix the issue when the projectName is not specified, the expression evaluation doesn't work. See [PR#156](https://github.com/Microsoft/java-debug/pull/156)
- Fix VMDisconnectionException in HCR. See [PR#150](https://github.com/Microsoft/java-debug/pull/150)


## 0.6.0 - 2018-2-1
### Added
- Support hot code replace. See [PR#225](https://github.com/Microsoft/vscode-java-debug/pull/225)

## 0.5.0 - 2017-12-20
### Added
- Support step filters when stepping. See [PR#155](https://github.com/Microsoft/vscode-java-debug/pull/155)
- Support expression evaluation. See [PR#126](https://github.com/Microsoft/vscode-java-debug/pull/126), [PR#131](https://github.com/Microsoft/java-debug/pull/131)
- Publish the binaries to the maven central repository. See [PR#132](https://github.com/Microsoft/java-debug/pull/132)

### Changed
- Adopt new VSCode 1.19.0 debug activation events. See [PR#196](https://github.com/Microsoft/vscode-java-debug/pull/196)
- Looking up the stack frame's associated source file from source containers to improve searching perf. See [PR#127](https://github.com/Microsoft/java-debug/pull/127)

## 0.4.0 - 2017-11-30
### Added
- Add `stopOnEntry` and `console` options for launch.json. See [PR#177](https://github.com/Microsoft/vscode-java-debug/pull/177)
- Support console input by launching the program in the integrated/external terminal. See [PR#122](https://github.com/Microsoft/java-debug/pull/122)
- Add debugging settings: `java.debug.settings.showHex`, `java.debug.settings.showStaticVariables`, `java.debug.settings.showQualifiedNames`, `java.debug.settings.maxStringLength`. See [README](https://github.com/Microsoft/vscode-java-debug/README.md) for details
- Support project scope when resolving multiple-root project. See [PR#174](https://github.com/Microsoft/vscode-java-debug/pull/174)

### Fixed
- Fix single file build issue. See [Issue#167](https://github.com/Microsoft/vscode-java-debug/issues/167)
- Fix perf issue when debugging with "stopOnEntry". See [PR#115](https://github.com/Microsoft/java-debug/pull/115)

## 0.3.1 - 2017-11-17
### Fixed
- Fix the unable to start debugging issue[Issue#146](https://github.com/Microsoft/vscode-java-debug/issues/146)

## 0.3.0 - 2017-11-10
### Added
- Support debugging java 9 project. See [Issue#47](https://github.com/Microsoft/vscode-java-debug/issues/47)
- Support debugging standalone java file. See [Issue#94](https://github.com/Microsoft/vscode-java-debug/issues/94)
- Support "cwd" and "env" in launch.json. See [Issue#12](https://github.com/Microsoft/vscode-java-debug/issues/12), [Issue#75](https://github.com/Microsoft/vscode-java-debug/issues/75)

### Changed
- Build workspace before starting debugger. See [Issue#32](https://github.com/Microsoft/vscode-java-debug/issues/32)
- Show progress when initializing the launch.json. See [PR#106](https://github.com/Microsoft/vscode-java-debug/pull/106)
- Get debug settings from VSCode user preferences. See [PR#135](https://github.com/Microsoft/vscode-java-debug/pull/135),[PR#94](https://github.com/Microsoft/java-debug/pull/94)

### Fixed
- Fix perf issue on getting locations of breakpoint. See [Issue#49](https://github.com/Microsoft/java-debug/issues/49)
- Show warning message when the debugger and the debuggee run in the different versions of JVMs. See [Issue#30](https://github.com/Microsoft/vscode-java-debug/issues/30)

## 0.2.0 - 2017-10-20
### Added
- Automatically resolve the main class during launching. See [Issue#9](https://github.com/Microsoft/vscode-java-debug/issues/9)
- Fully support external source files together with the changes from VSCode. See [PR#58](https://github.com/Microsoft/java-debug/pull/58)

### Changed
- Adopt the new DebugConfigurationProvider protocol of VS Code. See [PR#87](https://github.com/Microsoft/vscode-java-debug/pull/87)
- Display the function names in the format of ClassName.MethodName(Parameter List...).. See [PR#73](https://github.com/Microsoft/java-debug/pull/73)
- Improve the call stack display info for the files without sources. See [PR#72](https://github.com/Microsoft/java-debug/pull/72)

### Fixed
- Fix the inconsistent URI issue when set breakpoint request. See [PR#84](https://github.com/Microsoft/java-debug/pull/84)
- Avoid two stopped events for step and breakpoint. See [Issue#14](https://github.com/Microsoft/vscode-java-debug/issues/14)
- Fix the issue that JDT search might return multiple results from the same project. See [Issue#21](https://github.com/Microsoft/java-debug/issues/21)
- Avoid send error messages after debugger adapter stopped. See [PR#75](https://github.com/Microsoft/java-debug/pull/75)
- Fix several exception cases. See [PR#64](https://github.com/Microsoft/java-debug/pull/62), [PR#67](https://github.com/Microsoft/java-debug/pull/67), [PR#74](https://github.com/Microsoft/java-debug/pull/74)

## 0.1.0 - 2017-09-27
### Added

- Launch/Attach
- Breakpoints
- Exceptions
- Pause & Continue
- Step In/Out/Over
- Variables
- Callstacks
- Threads
- Debug console

