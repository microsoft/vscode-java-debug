# Change Log
All notable changes to the "vscode-java-debugger" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

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

