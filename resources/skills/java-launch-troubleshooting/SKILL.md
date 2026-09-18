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
4. **Stop on the first failure or timeout.** Report the returned result and diagnose the cause. Do not automatically retry `debug_java_application` or relaunch through `run_in_terminal`. A timeout means startup is unconfirmed, not necessarily failed; follow the failure-handling rules below.
5. **Stop when done.** When the user says "stop", "kill it", or has the answer they need, call `stop_debug_session`.

## Common Failure Modes

| Symptom from `debug_java_application` | Likely cause | Suggested fix |
|---|---|---|
| `mainClass is not configured` / `mainClass missing` | Project has no `launch.json`, and the file has no `public static void main` | Ask user which class to launch, or generate `launch.json` |
| `Could not resolve classpath` | Maven/Gradle import has not completed, or `pom.xml` has unresolved dependencies | Wait for Java Language Server import, then ask user to run `Java: Clean Java Language Server Workspace` |
| `Compilation failed` with file:line | Source code has a compile error | Fix the reported compilation error before attempting another launch; follow the failure-handling rules below |
| `Project not detected` | `workspacePath` does not contain a build file | Re-check `workspacePath`; for multi-module projects, use the module root, not the repo root |

## When NOT to Use This Skill

- The user is editing or refactoring Java code without running it → do nothing
- The user is already inside a live debug session and wants to inspect variables, evaluate expressions, walk the stack, step, or set / remove breakpoints → use `java-debug-inspection` instead, do not re-launch
- The program is a non-Java language → do not load this skill

## Failure handling

After the first launch failure or timeout, stop automatic launch attempts, including when Java Language Server is not ready or the project is not detected. Do not use `run_in_terminal`, `mvn`, `gradle`, or raw `java` commands to bypass this rule.

You may inspect existing errors and terminal output. After a timeout, you may call `get_debug_session_info` once to check whether the original launch has become active. Do not enter a polling loop or terminate the original launch merely because the wait expired.

A new launch attempt is allowed only after fixing an identified cause or when the user explicitly requests a retry. Before that attempt, check for an existing session; do not replace an active session without explicit restart intent.
