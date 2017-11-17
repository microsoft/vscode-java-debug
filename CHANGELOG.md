# Change Log
All notable changes to the "vscode-java-debugger" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

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
