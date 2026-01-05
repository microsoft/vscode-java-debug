# Java Debugging Agents

VS Code Java extensions include two AI-powered debugging assistants that integrate with GitHub Copilot Chat to help you understand and fix Java applications using natural language.

## Overview

Instead of manually setting breakpoints and inspecting variables, you can describe your task in natural language and let the agents help you:

### **JavaDebug Agent - Problem Diagnosis**
- Analyzes code to form hypotheses about bugs
- Sets targeted breakpoints and pauses execution
- Inspects variables, evaluates expressions, steps through code
- Finds root causes of errors and bugs

### **JavaTrace Agent - Behavior Verification**
- Verifies that your program behaves as expected
- Sets logpoints to trace execution without pausing
- Monitors program flow across multiple executions
- Identifies patterns and performance characteristics

## Requirements

- VS Code 1.95.0 or later
- [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java)
- [Debugger for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-debug)
- GitHub Copilot Chat extension

## Getting Started

### 1. Open Copilot Chat

Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Shift+I` (macOS) to open Copilot Chat.

### 2. Select the Right Agent

In the Copilot Chat panel, click on the agent selector dropdown at the top.

#### When to use **JavaDebug** agent:
```
❌ "Why am I getting NullPointerException?"
❌ "My code crashes at line 25"
❌ "Why is this calculation wrong?"
→ Use JavaDebug for problem diagnosis
```

#### When to use **JavaTrace** agent:
```
✅ "Verify my user registration flow works correctly"
✅ "Show me the execution path of this method"
✅ "Check if my order processing handles all cases"
→ Use JavaTrace for behavior verification
```

### 3. Enter Your Request

Once you've selected the agent, describe your task in natural language:

**JavaDebug Example:**
```
I'm getting a NullPointerException in OrderService.processOrder()
```

**JavaTrace Example:**
```
Verify that the user registration flow follows this path: validate → check uniqueness → save → send email
```

### 4. Let the Agent Work

The agent will analyze your code, set up the debugging/tracing environment, and provide insights.

## Choosing the Right Agent

### Quick Decision Guide

| Your Need | Agent | Why |
|-----------|-------|-----|
| Find root cause of error | **JavaDebug** | Needs to pause and inspect |
| Understand bug location | **JavaDebug** | Requires deep variable analysis |
| Verify expected behavior | **JavaTrace** | Non-intrusive observation |
| Analyze execution flow | **JavaTrace** | Trace without interrupting |
| Check performance patterns | **JavaTrace** | Continuous monitoring |
| Integration testing | **JavaTrace** | Verify multiple components together |
| Step-by-step analysis | **JavaDebug** | Requires execution control |

### Typical Workflows

#### **Bug Fix Workflow (JavaDebug)**
```
1. "My order processing fails sometimes" 
   → Use JavaTrace to observe patterns
2. "I found the invalid orders go through validation"
   → Use JavaDebug to analyze why validation is bypassed
3. Fix the bug
   → Use JavaTrace to verify the fix
```

#### **New Feature Verification (JavaTrace)**
```
1. "I built a new registration flow"
   → Use JavaTrace to verify it works as expected
2. "Does it handle all edge cases?"
   → Use JavaTrace to test boundary conditions
3. "What's the performance?"
   → Use JavaTrace to measure execution times
```

---

## JavaDebug Agent Details

## JavaDebug Agent Details

### How It Works

JavaDebug uses **hypothesis-driven debugging**:

```
┌──────────────────────────────────────────┐
│  1. STATIC ANALYSIS                      │
│     Read code, understand the problem    │
└────────────────┬─────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│  2. FORM HYPOTHESIS                      │
│     "Variable X is null at line Y"       │
└────────────────┬─────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│  3. SET BREAKPOINT & PAUSE                │
│     Stop execution at target location    │
└────────────────┬─────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│  4. VERIFY HYPOTHESIS                    │
│     Inspect variables and expressions    │
│     ├─ YES → Found root cause!           │
│     └─ NO  → Form new hypothesis         │
└──────────────────────────────────────────┘
```

### Example Usage

#### Debug a NullPointerException
```
I'm getting NPE when calling userService.getUser()
```

The agent will:
1. Read `UserService.java` to understand the code
2. Form hypothesis: "Maybe `findById()` returns null"
3. Set breakpoint at the NPE location
4. Pause execution and inspect variables
5. Report: "The `user` variable is null because `findById()` returns null when ID doesn't exist"

#### Debug Wrong Calculation
```
The calculateTotal() method returns $0 instead of $150
```

#### Debug Concurrent Issues
```
I suspect a race condition in the worker threads
```

### Agent Capabilities

| Capability | Description |
|------------|-------------|
| **Start Debug Session** | Launch or attach to Java applications |
| **Set Breakpoints** | Set conditional or unconditional breakpoints |
| **Pause Execution** | Stop at breakpoint to inspect state |
| **Inspect Variables** | View local variables, fields, and objects |
| **Evaluate Expressions** | Execute Java expressions in debug context |
| **Step Through Code** | Step over, step into, step out |
| **Multi-thread Support** | Debug concurrent applications |
| **Stack Trace Analysis** | View and navigate call stacks |

---

## JavaTrace Agent Details

### How It Works

JavaTrace uses **verification-driven tracing**:

```
┌──────────────────────────────────────────┐
│  1. DEFINE EXPECTATIONS                  │
│     What should the program do?          │
└────────────────┬─────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│  2. BATCH LOGPOINT SETUP                 │
│     Set observation points (no pause)    │
└────────────────┬─────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│  3. CONTINUOUS EXECUTION                 │
│     Program runs normally, traces output │
│     to Debug Console                     │
└────────────────┬─────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│  4. PATTERN ANALYSIS                     │
│     Compare actual vs expected behavior  │
│     Identify anomalies and patterns      │
└──────────────────────────────────────────┘
```

### Example Usage

#### Verify User Registration Flow
```
Trace the user registration to verify it: validates email → checks uniqueness → creates user → sends confirmation
```

The agent will:
1. Identify key verification points in the flow
2. Set logpoints at each stage (without pausing)
3. Run multiple registration attempts
4. Report: "Email validation ✅, uniqueness check ✅, user creation ✅, but email sending failed silently in 2/3 cases!"

#### Verify Order Processing
```
Show me the execution flow of order processing and identify any performance bottlenecks
```

#### Check Performance Patterns
```
Trace the database query operations to see how long they take and if there are any outliers
```

### Agent Capabilities

| Capability | Description |
|------------|-------------|
| **Set Logpoints** | Trace execution without pausing program |
| **Batch Setup** | Configure multiple observation points at once |
| **Pattern Monitoring** | Watch execution patterns across multiple runs |
| **Performance Analysis** | Measure execution times and identify bottlenecks |
| **Behavior Verification** | Confirm program follows expected flow |
| **Non-intrusive** | Program continues running normally |
| **Data Visualization** | Display traced data in Debug Console |

### Key Differences from JavaDebug

| Aspect | JavaDebug | JavaTrace |
|--------|-----------|-----------|
| **Program State** | **Paused** at breakpoints | **Continues running** |
| **Observation Style** | Interactive inspection | Continuous monitoring |
| **Use Case** | Find unknown bugs | Verify known behavior |
| **Data Collection** | Single point inspection | Multiple executions |
| **Best For** | Problem diagnosis | Behavior verification |

---

## Agent Capabilities Summary

## Agent Capabilities Summary

### JavaDebug Capabilities
- Start/attach to debug sessions
- Set conditional and unconditional breakpoints
- Pause execution for inspection
- Inspect variables and object fields
- Evaluate Java expressions
- Step over/into/out of methods
- Multi-threaded debugging support
- Stack trace analysis and navigation

### JavaTrace Capabilities  
- Set logpoints (non-breaking trace points)
- Batch setup multiple observation points
- Monitor execution patterns across runs
- Analyze performance with timing data
- Trace data flow and transformations
- Verify behavior against expectations
- Pattern recognition and anomaly detection
- Performance bottleneck identification

---

## How It Works

### JavaDebug: Hypothesis-Driven Debugging

1. **Static Analysis** - Read code and understand the problem
2. **Form Hypothesis** - Create specific hypothesis about the bug
3. **Set Breakpoint** - Place breakpoint at target location
4. **Pause & Inspect** - Check variables when breakpoint hits
5. **Verify** - Confirm or reject hypothesis, iterate if needed

### JavaTrace: Verification-Driven Tracing

1. **Define Expectations** - Clarify expected behavior
2. **Batch Setup** - Configure logpoints at key locations
3. **Run Program** - Execute normally while tracing
4. **Collect Data** - Gather execution patterns across runs
5. **Analyze** - Compare actual vs expected, identify patterns

## Tips for Best Results

### Select the Correct Agent

The most important step is choosing the right agent:

```
JavaDebug Agent:
✅ "Why does X happen?"
✅ "I'm getting an error"
✅ "This method returns the wrong value"
✅ Need to pause and inspect

JavaTrace Agent:
✅ "Does this work as expected?"
✅ "Show me the execution flow"
✅ "Verify this behavior"
✅ Need non-intrusive observation
```

### Stay in Agent Mode

Make sure you're in the correct **agent mode**. Check the agent selector in the Chat panel:
- If you need debugging help → Select **JavaDebug**
- If you need behavior verification → Select **JavaTrace**

### Be Specific

#### JavaDebug:
```
✅ Good: "Why does getUserById return null when id=123?"
❌ Vague: "Something is wrong"
```

#### JavaTrace:
```
✅ Good: "Trace the order processing to verify it handles invalid orders correctly"
❌ Vague: "Check if this works"
```

### Provide Context

#### JavaDebug:
```
✅ Good: "The order total is $0 instead of $150 for order 456"
❌ Vague: "Wrong calculation"
```

#### JavaTrace:
```
✅ Good: "I want to verify the user registration flow validates email, checks uniqueness, creates user, and sends confirmation"
❌ Vague: "Verify registration"
```

### Multiple Runs for JavaTrace

For best results with JavaTrace, let the agent run multiple scenarios:
- Normal path (happy case) - 2-3 times
- Error paths - edge cases and invalid inputs
- This helps identify patterns and anomalies

---

## Workflow Examples

### Example 1: Bug Investigation (JavaDebug)

```
Problem: "Getting NullPointerException in payment processing"

Step 1: Switch to JavaDebug agent
Step 2: Ask: "Why am I getting NPE in PaymentService.processPayment()?"
Step 3: Agent will:
  • Read PaymentService code
  • Form hypothesis about which variable is null
  • Set breakpoint at NPE location
  • Pause and inspect variables
  • Report: "The 'paymentMethod' is null because customer has no payment methods saved"
Step 4: Fix the issue and retest
```

### Example 2: Feature Verification (JavaTrace)

```
Feature: "New user registration flow"

Step 1: Switch to JavaTrace agent
Step 2: Ask: "Verify the registration flow validates email, checks for duplicates, creates user, and sends confirmation"
Step 3: Agent will:
  • Identify key verification points
  • Set logpoints at each stage
  • Run test registrations (normal + edge cases)
  • Report patterns and any failures
  • Recommendation: "Email validation works, but sending confirmation failed in 40% of cases"
Step 4: Fix and re-verify
```

### Example 3: Performance Analysis (JavaTrace)

```
Question: "Is the database query performance acceptable?"

Step 1: Switch to JavaTrace agent
Step 2: Ask: "Trace database operations and show me execution times and any bottlenecks"
Step 3: Agent will:
  • Set logpoints around DB operations
  • Run queries multiple times
  • Analyze timing patterns
  • Report: "Average query time: 45ms, but occasional spikes to 2 seconds detected"
Step 4: Investigate and optimize
```

## Troubleshooting

### Agent Not Found in Dropdown

Make sure:
- GitHub Copilot Chat extension is installed and activated
- You're in a VS Code workspace with a Java project open
- Both debugging extensions are installed:
  - [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java)
  - [Debugger for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-debug)

### JavaDebug: Debug Session Won't Start

Ensure:
- Your project compiles successfully (`mvn compile` or `gradle build`)
- No other debug session is running
- The main class exists and is accessible
- Check terminal output for error messages

### JavaDebug: Breakpoint Not Hit

The agent will tell you to trigger the scenario. You need to:
1. Run the part of your application that executes the code
2. The breakpoint will be hit when the code path is executed
3. The agent will continue analysis once paused

### JavaTrace: No Logpoint Output

Check that:
- Debug session is in RUNNING state (not PAUSED)
- The code path you're tracing is actually being executed
- Logpoint expressions are syntactically valid Java
- The debug console is visible (View → Debug Console)

---

## Limitations

### General
- Requires an active Java project with proper configuration
- Performance may vary with very large codebases

### JavaDebug
- Cannot debug remote applications without attach configuration
- Pausing execution may affect timing-dependent code
- Very large objects may be slow to inspect

### JavaTrace
- Still requires JDWP connection (has some overhead)
- Not suitable for ultra-performance-critical sections
- Not recommended for production environments
- Logpoint expressions are evaluated at runtime (can impact performance if complex)

## Feedback

If you encounter issues or have suggestions, please:
- File an issue on [GitHub](https://github.com/microsoft/vscode-java-debug/issues)
- Include which agent you were using (JavaDebug or JavaTrace)
- Include the agent's response and your request

## See Also

### Documentation
- [Debugger for Java Documentation](https://github.com/microsoft/vscode-java-debug)
- [JavaDebug Agent Details](debug.agent.md)
- [JavaTrace Agent Details](trace.agent.md)
- [No-Config Debug](../scripts/noConfigScripts/README.md)
- [Troubleshooting Guide](../../Troubleshooting.md)

### Key Concepts
- **Hypothesis-Driven Debugging** - Used by JavaDebug to systematically find root causes
- **Verification-Driven Tracing** - Used by JavaTrace to verify and understand behavior
- **JDWP (Java Debug Wire Protocol)** - Standard protocol for Java debugging that both agents rely on
