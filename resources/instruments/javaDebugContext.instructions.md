---
description: Use when the user wants to run, launch, start, debug, verify, or step through a Java program (main class, Spring Boot, JAR, Maven, Gradle); or when inspecting variables, stack frames, threads, evaluating expressions, or managing breakpoints in a Java debug session.
---

For Java run/launch/debug/inspection requests, prefer the Java debug language model tools over generic shell commands (`mvn exec:java`, `gradle run`, raw `java -cp …`). These tools are contributed by the `Debugger for Java` extension and are deferred — activate them with `tool_search_tool_regex` using pattern `java_breakpoint|debug` before first use, then call them by name.

## Pick the right skill

| User intent | Load skill | Typical tools |
|---|---|---|
| Run / launch / start / stop a Java program, diagnose launch failures (build error, classpath, mainClass missing) | `java-launch-troubleshooting` | `debug_java_application`, `get_debug_session_info`, `stop_debug_session` |
| Inspect a Java program that is already being debugged: read variables, evaluate expressions, walk the stack, step in/over/out, continue, set or remove breakpoints | `java-debug-inspection` | `get_debug_variables`, `get_debug_stack_trace`, `evaluate_debug_expression`, `get_debug_threads`, `debug_step_operation`, `set_java_breakpoint`, `remove_java_breakpoints` |

If both apply (e.g. "launch and break on entry of `Main.foo`"), load `java-launch-troubleshooting` first, then `java-debug-inspection` after the session is active.

After the first launch failure or timeout, do not automatically retry `debug_java_application` or relaunch through terminal commands, including when Java Language Server is not ready or the project is not detected. Report the result and diagnose the cause.

A timeout means startup is unconfirmed, not necessarily failed. You may check `get_debug_session_info` once and inspect existing terminal output; do not enter a polling loop or terminate the original launch just because the wait expired.

Only start a new launch attempt after fixing an identified cause or when the user explicitly requests a retry. Check for an existing session first and do not replace it without explicit restart intent.
