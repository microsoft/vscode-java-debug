---
name: java-launch-troubleshooting
description: Use when the user wants to run, launch, start, restart, or stop a Java program (main class, Spring Boot, JAR, Maven, Gradle), or diagnose launch failures (mainClass missing, classpath unresolved, compile failure, "project not detected", `ClassNotFoundException` at startup). NOT for inspecting variables, stepping, or setting breakpoints in an already-running debug session — use `java-debug-inspection` for that.
---

# Java Launch Troubleshooting

Use this skill when the user wants to **start or stop** a Java program, or when an attempted launch fails. Typical user phrases:

- "run this main class", "start the app", "launch the Spring Boot project", "run the jar"
- "stop the debug session", "kill the running app"
- prior `run_in_terminal` failed with `ClassNotFoundException`, `mainClass is not set`, `Could not find or load main class`, `Could not resolve classpath`
- the user changed `pom.xml` / `build.gradle` and the app no longer starts

## Tools

These language model tools are contributed by the `Debugger for Java` extension and are deferred. Activate them with `tool_search_tool_regex` using pattern `java_breakpoint|debug` before first use.

| Tool | Purpose |
|---|---|
| `debug_java_application` | Build + resolve classpath + start JVM. Returns precise compile and classpath errors. |
| `get_debug_session_info` | Check whether a debug session is already running and its status. |
| `stop_debug_session` | Stop a running Java debug session cleanly. |

## Preferred Workflow

1. **Confirm intent.** Is the user trying to *run / start / launch / stop* a Java program (use this skill) or just edit code (do not load this skill)?
2. **Check existing session.** Call `get_debug_session_info` first. If a session is already running for the target, do not launch a second one.
3. **Launch.** Call `debug_java_application` with `target` = the fully qualified main class or JAR, and `workspacePath` = the project root containing `pom.xml`, `build.gradle`, or `.classpath`. Let `skipBuild` default to `false` so the tool handles compilation.
4. **Read the error.** If `debug_java_application` fails, the error message is structured (mainClass missing, classpath unresolved, build failure with line number). Use it to suggest a fix — do not retry with `run_in_terminal`.
5. **Stop when done.** When the user says "stop", "kill it", or has the answer they need, call `stop_debug_session`.

## Common Failure Modes

| Symptom from `debug_java_application` | Likely cause | Suggested fix |
|---|---|---|
| `mainClass is not configured` / `mainClass missing` | Project has no `launch.json`, and the file has no `public static void main` | Ask user which class to launch, or generate `launch.json` |
| `Could not resolve classpath` | Maven/Gradle import has not completed, or `pom.xml` has unresolved dependencies | Wait for Java Language Server import, then ask user to run `Java: Clean Java Language Server Workspace` |
| `Compilation failed` with file:line | Source code has a compile error | Fix the reported error in the source file, do not retry the launch |
| `Project not detected` | `workspacePath` does not contain a build file | Re-check `workspacePath`; for multi-module projects, use the module root, not the repo root |

## When NOT to Use This Skill

- The user is editing or refactoring Java code without running it → do nothing
- The user is already inside a live debug session and wants to inspect variables, evaluate expressions, walk the stack, step, or set / remove breakpoints → use `java-debug-inspection` instead, do not re-launch
- The program is a non-Java language → do not load this skill

## Fallback

If `debug_java_application` returns `Java Language Server not ready` or repeats the same error twice, fall back to `run_in_terminal` with the appropriate `mvn` or `gradle` command and report the raw output to the user. Do not retry the debug tool more than twice.
