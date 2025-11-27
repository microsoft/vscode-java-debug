
# Debug Orchestrator for Java (VS Code + No‑Config Debug)

> This agent integrates with the VS Code Debug extension’s **languageModelTools** to implement the critical workflow:
> 1) **First call** `java_project_rebuild` (toolReferenceName: `java-project-rebuild`) to perform a clean rebuild and return the **classpath** (`outputPath`).
> 2) **Then call** `debug_java_application` (toolReferenceName: `debugJavaApplication`) with `skipBuild: true` and pass the classpath from step 1.
>
> Internally, the tool uses `debugjava` to start the JVM and automatically attach the VS Code Java debugger. The agent monitors breakpoints, stack traces, variables, and execution flow using VS Code Debug APIs and DAP.

---

## 🎯 Goals
- Start Java debugging in VS Code **without `launch.json`** (No‑Config Debug) and auto-attach.
- Enforce a unified workflow: **rebuild → debug → monitor/control → (optional) adjust logging level or hand off to a coding agent for fixes**.
- Use **context-isolated subagents** for safe separation of responsibilities: breakpoint management, diagnostics, and logging level changes.

---

## 🧩 Integrated languageModelTools

### `java_project_rebuild` (toolReferenceName: `java-project-rebuild`)
**Purpose**: Trigger a clean rebuild to recompile source files and resolve dependencies. Can rebuild all projects in the workspace or a specific project.

**Input** (optional):
- `resourcePath: string` — File path or URI to determine which project to rebuild. If omitted, rebuilds all projects in the workspace.

**Output (expected)**:
- `outputPath: string` — Accurate classpath (absolute paths separated by `:` on Unix or `;` on Windows).

> Note: `debug_java_application` requires the `outputPath` from this tool as its `classpath` argument when `skipBuild` is true.

---

### `debug_java_application` (toolReferenceName: `debugJavaApplication`)
**Purpose**: Start a Java application using `debugjava` and attach the debugger automatically. The session runs until the user stops it.

**Workflow requirement**: Must call `java_project_rebuild` first to get the classpath.

**Input**:
- `target: string` (required) — One of:
  1) Main class name (simple or fully qualified, e.g., `App` or `com.example.Main`).
  2) JAR file path (e.g., `build/libs/app.jar`).
  3) Raw Java arguments (e.g., `-cp bin com.example.Main`).
- `workspacePath: string` (required) — Absolute path to the project root.
- `args: string[]` (optional) — Program arguments for `main(String[])`.
- `skipBuild: boolean` (default: false) — Set to **true** after rebuild.
- `classpath: string` — Required when `skipBuild` is true; obtained from `outputPath`.

**Behavior**:
- Internally runs `debugjava` → JVM starts with JDWP → VS Code auto-attaches the debugger.

---

## 🔄 Debugging Workflow (Agent Orchestration)

### 1) Detect intent → choose launch mode
Examples:
- “Debug `com.example.app.Application` with logging level DEBUG”
- “Debug JAR and set port to 8081”

### 2) **Rebuild first** (compute classpath)
```pseudo
call tool: java-project-rebuild
  with: { resourcePath?: "/absolute/path/to/project" }
receive: { outputPath: CP }    # Accurate classpath
cache: CP
```

### 3) **Start No‑Config Debug** (auto-attach)
```pseudo
call tool: debugJavaApplication
  with: {
    target: "com.example.app.Application" | "build/libs/app.jar" | "-cp ... Main",
    workspacePath: "/absolute/path/to/project",
    args: ["--server.port=8081", "--logging.level.root=DEBUG"],
    skipBuild: true,
    classpath: CP
  }
# debugjava starts → VS Code auto-attaches → session active
```

### 4) **Monitor and control the session** (VS Code Debug API / DAP)
- Subscribe to: `onDidStartDebugSession`, `onDidTerminateDebugSession`, `stopped` events.
- On breakpoint hit (`stopped`):
  - Request `stackTrace → scopes → variables`
  - Render summary in Chat (thread, top frames, key variables).
- Execution control: `continue`, `stepOver`, `stepInto`, `stepOut`, `pause`.
- Breakpoint management: list/add/remove line, conditional, and logpoints.
- Evaluate expressions: `evaluate { expression: "a + b" }`.

### 5) **Adjust logging level** (two options)
- **Restart with args** (simple and reliable):
  - Stop current session → call `debugJavaApplication` again with updated `args`:
    `--logging.level.root=TRACE --logging.level.com.example.app=DEBUG`
- **Hot change via Spring Boot Actuator** (if enabled):
  - `POST /actuator/loggers/{logger}` with `{ "configuredLevel": "DEBUG" }`.

### 6) **(Optional) Handoff to Coding Agent**
- Provide context (stack, variables, file/line, fix intent) to Coding Agent.
- Coding Agent applies changes, rebuilds, runs tests, creates PR.
- Return to this agent to verify fix.

---

## 🔒 Context-Isolated Subagents (Recommended)

### Subagent: **Breakpoints**
- Capabilities: read/write breakpoints, conditional/logpoints.
- No network or file write permissions.

### Subagent: **Diagnostics**
- Capabilities: read-only DAP data (threads, stack, variables), summarize for Chat.
- Cannot modify code or breakpoints.

### Subagent: **Logging**
- Capabilities: restart with new args or call Actuator endpoint to change log level.
- No code editing.

---

## 🛠 Agent Tool Declarations (Mapping to languageModelTools and VS Code APIs)

### `invokeRebuild`
```tool
name: invokeRebuild
description: Call languageModelTool `java-project-rebuild` to perform a clean rebuild and return classpath.
input_schema:
  type: object
  properties:
    resourcePath: { type: string }
impl:
  kind: languageModelTool.invoke
  toolReferenceName: java-project-rebuild
output_schema:
  type: object
  properties:
    outputPath: { type: string, description: "Accurate classpath" }
```

### `startNoConfigDebug`
```tool
name: startNoConfigDebug
description: Call `debugJavaApplication` (skipBuild=true) with classpath from rebuild to start debugjava and auto-attach.
input_schema:
  type: object
  properties:
    target: { type: string }
    workspacePath: { type: string }
    args: { type: array, items: { type: string } }
    classpath: { type: string }
  required: [target, workspacePath, classpath]
impl:
  kind: languageModelTool.invoke
  toolReferenceName: debugJavaApplication
  fixed_args: { skipBuild: true }
```

### `watchSession`
```tool
name: watchSession
description: Subscribe to VS Code debug session events; on 'stopped', fetch stack/scopes/variables and summarize.
impl:
  kind: vscode.debug.subscribe
```

### `dapControl`
```tool
name: dapControl
description: Send a DAP command to the active session (continue, stepOver, stepInto, pause, evaluate).
input_schema:
  type: object
  properties:
    command: { type: string, enum: ["continue","pause","stepOver","stepInto","stepOut","evaluate"] }
    arguments: { type: object }
  required: [command]
impl:
  kind: vscode.debug.customRequest
```

### `breakpoints`
```tool
name: breakpoints
description: List/add/remove/update breakpoints and logpoints.
impl:
  kind: vscode.debug.manageBreakpoints
```

### `switchLogLevel`
```tool
name: switchLogLevel
description: Adjust logging level via restart (args) or Spring Boot Actuator.
input_schema:
  type: object
  properties:
    mode: { type: string, enum: ["restart","actuator"] }
    root: { type: string, enum: ["TRACE","DEBUG","INFO","WARN","ERROR"] }
    packages:
      type: array
      items: { type: object, properties: { logger: { type: string }, level: { type: string } } }
    actuatorUrl: { type: string }
impl:
  kind: composite
  steps:
    - when: "mode == 'restart'"
      run: languageModelTool.invoke
      toolReferenceName: debugJavaApplication
      argsFromContext:
        target: "<previous target>"
        workspacePath: "<previous workspacePath>"
        classpath: "<cached CP>"
        skipBuild: true
        args: "--logging.level.root=${root} ${packages.map(p => `--logging.level.${p.logger}=${p.level}`).join(' ')}"
    - when: "mode == 'actuator'"
      forEach: "packages"
      run: http.request
      request:
        method: "POST"
        url: "${actuatorUrl}/${item.logger}"
        json: { configuredLevel: "${item.level}" }
```

---

## 🧪 Prompt → Flow Examples
- **“Rebuild and debug `com.example.app.Application` with logging level DEBUG”**:
  1) `invokeRebuild({ resourcePath: "/abs/project" })` → `CP`
  2) `startNoConfigDebug({ target: "com.example.app.Application", workspacePath: "/abs/project", classpath: CP, args: ["--logging.level.root=DEBUG"] })`
  3) `watchSession()` → On breakpoint hit, show stack and variables.

- **“Debug JAR with port 8081 and log variables on breakpoint”**:
  1) `invokeRebuild({})` → `CP`
  2) `startNoConfigDebug({ target: "build/libs/app.jar", workspacePath: "/abs/project", classpath: CP, args: ["--server.port=8081"] })`
  3) `breakpoints.add({ file: "CalcService.java", line: 18, logMessage: "a=${a}, b=${b}" })`
  4) `dapControl({ command: "stepOver" })`

- **“Change log level for `com.example.app` to TRACE (no breakpoint)”**:
  - `switchLogLevel({ mode: "restart", root: "INFO", packages: [{ logger: "com.example.app", level: "TRACE" }] })`

---

## ⚠️ Notes
- Always follow the sequence: **rebuild → debug**.
- Accurate classpath is critical for debugging; ensure `outputPath` is absolute and properly formatted.
- No‑Config Debug and `launch.json` are not mutually exclusive; keep `launch.json` for remote attach or repeatable tasks if needed.

---

## 📋 How does this agent implement debugging?
1. **Build**: Calls `java-project-rebuild` to get accurate classpath.
2. **Start**: Calls `debugJavaApplication` with `skipBuild=true` and `classpath` → extension runs `debugjava` → VS Code auto-attaches.
3. **Monitor/control**: Subscribes to debug events and uses DAP for stack/variables, execution control, and breakpoints.
4. **Adjust logging**: Restart with args or use Actuator; optionally hand off to Coding Agent for code fixes and PR creation.
