---
name: java-debug-inspection
description: Use when inspecting a Java program that is already being debugged — read local variables, walk the call stack, list threads, evaluate expressions, step in/over/out, continue execution, or set / remove breakpoints in an active Java debug session. NOT for starting, launching, or stopping a debug session — use `java-launch-troubleshooting` for that.
---

# Java Debug Inspection

Use this skill when a Java debug session is already active (the user has launched the program with `debug_java_application` or via the VS Code Run/Debug UI) and they want to **observe or steer the running program**. Typical user phrases:

- "what's the value of `user.id` right now?", "show me the local variables"
- "evaluate `list.size()`", "what does `service.findById(42)` return at this frame?"
- "show the stack trace", "what threads are running?", "go up one frame"
- "step in", "step over", "step out", "continue", "resume"
- "set a breakpoint at `OrderService.placeOrder`", "remove the breakpoint on line 42"

If no debug session is active, this skill should not be used — load `java-launch-troubleshooting` first to start one.

## Tools

These language model tools are contributed by the `Debugger for Java` extension and are deferred. Activate them with `tool_search_tool_regex` using pattern `java_breakpoint|debug` before first use.

| Tool | Purpose |
|---|---|
| `get_debug_variables` | Read local variables, fields, and watched expressions in the current frame. |
| `get_debug_stack_trace` | List call-stack frames for the focused (or specified) thread. |
| `get_debug_threads` | List all threads in the session with state (running, stopped, terminated). |
| `evaluate_debug_expression` | Evaluate an arbitrary Java expression in the context of the focused frame. |
| `debug_step_operation` | Step in, step over, step out, or continue. Requires the program to be paused. |
| `set_java_breakpoint` | Set a line / method / exception breakpoint. Works at any time during the session. |
| `remove_java_breakpoints` | Remove one or more breakpoints by ID or location. |

## Preferred Workflow

1. **Confirm session state.** If the user asks to step or evaluate an expression, the program must be paused (typically at a breakpoint). If unsure, call `get_debug_session_info` from `java-launch-troubleshooting` to check, or list threads with `get_debug_threads`.
2. **Inspect first, then act.** For "what's the value of X" — call `get_debug_variables` or `evaluate_debug_expression`. Do not guess from source code.
3. **Step / continue.** For "step over" / "step in" / "step out" / "continue", call `debug_step_operation` with the matching action. After each step, re-read variables or stack as needed.
4. **Breakpoints.** For "set a breakpoint at …", call `set_java_breakpoint` with the file URI + line, or fully qualified method signature, or exception class. For "remove the breakpoint at …", call `remove_java_breakpoints`.
5. **Report precisely.** Quote the exact value or stack frame returned by the tool — do not paraphrase.

## Common Pitfalls

| Symptom | Likely cause | Fix |
|---|---|---|
| `debug_step_operation` returns "thread is not paused" | The program is running, not stopped at a breakpoint | Ask the user to add a breakpoint first, or wait for the next stop event |
| `evaluate_debug_expression` returns `<no active frame>` | No focused stack frame, often because the session just resumed | Re-call `get_debug_stack_trace` to refocus a frame |
| `get_debug_variables` returns empty for a parameter | Compilation without `-g` (no local variable table) | Inform user; offer to inspect via `evaluate_debug_expression` instead |
| Step in jumps into JDK internals | Default step filters disabled | Suggest enabling `java.debug.settings.stepping.skipClasses` |

## When NOT to Use This Skill

- The user wants to *start* a Java program (no session yet) → use `java-launch-troubleshooting`
- The user wants to *stop* the session → use `stop_debug_session` from `java-launch-troubleshooting`
- The program is a non-Java language → do not load this skill
- The user is editing source code without an active debug session → do nothing

## Fallback

If a tool returns "Java Language Server not ready" or repeats the same error twice, report the raw error to the user and stop calling debug tools for the current turn. Do not retry more than twice.
