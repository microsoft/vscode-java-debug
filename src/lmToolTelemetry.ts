// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Telemetry helpers for the language-model-tool surface.
 *
 * POLICY: this module is the ONLY place inside the LMT code path that is
 * allowed to call `sendInfo` / `sendError`. Direct calls from individual
 * tool implementations are forbidden so that PII risk can be audited in
 * one file.
 *
 * Strict rules — every contributor MUST follow these:
 *
 *   1. Do NOT pass user-provided strings as telemetry properties. This
 *      includes (non-exhaustive):
 *        - `target` (main class / JAR path / raw -cp args)
 *        - `expression` (debug expression to evaluate)
 *        - `condition` / `hitCondition` / `logMessage` (breakpoint inputs)
 *        - `filePath` / `currentFile` / source file paths
 *        - `currentLine` / `lineNumber`
 *        - `sessionName` (`launch.json` `name` field; often contains class
 *           or project names)
 *        - `reason` (user-supplied stop reason)
 *        - `error.message` / `error.stack` (JVM stack traces leak user
 *           class and method names)
 *        - any class name, method name, package name, or source path
 *
 *   2. Only enums, booleans, durations, counts, opaque session IDs (GUIDs)
 *      and our own extension version are allowed.
 *
 *   3. When classifying free-form input (e.g. error text -> errorCategory)
 *      the classifier function inspects the input in-memory and emits ONLY
 *      the enum. Unmatched values map to `'other'` / `'unknown'`. The
 *      original text is NEVER attached to the event.
 *
 *   4. New telemetry events SHOULD go through `recordToolInvocation` /
 *      `recordChatActivation` or a new dedicated recorder added below.
 *      The raw `sendInfo` API is wrapped by `sanitizedSend` here.
 */

import { sendInfo } from "vscode-extension-telemetry-wrapper";

// ============================================================================
// Enum types (the only shape telemetry properties may take)
// ============================================================================

export type ToolOutcome =
    | 'success'
    | 'failure'
    | 'timeout'
    | 'cancelled'
    | 'lsNotReady'
    | 'noActiveSession'
    | 'noSuspendedThread'
    | 'noStackFrame';

export type ErrorCategory =
    | 'mainClassMissing'
    | 'classpathUnresolved'
    | 'buildFailure'
    | 'projectNotDetected'
    | 'sessionAlreadyRunning'
    | 'timeout'
    | 'lsNotReady'
    | 'noActiveSession'
    | 'noSuspendedThread'
    | 'noStackFrame'
    | 'cancelled'
    | 'other';

/**
 * Why the launch-time classname detection failed to resolve a fully-qualified
 * class name. Replaces the previous boolean `detected: false` so we can
 * distinguish "we never had a chance" (sourceDirMissing) from "we found the
 * file but it has no package" (noPackageDeclaration).
 */
export type ClassNameDetectionFailure =
    | 'sourceDirMissing'   // None of the candidate src directories existed.
    | 'fileNotFound'       // We walked the candidate dirs but never found ClassName.java.
    | 'parseError'         // We found the file but could not read or scan it.
    | 'noPackageDeclaration'; // We found and parsed the file; it has no `package ...;`.

/**
 * Which candidate source-directory layout the detector was using when it
 * decided the outcome. Together with {@link ClassNameDetectionFailure} this
 * lets us correlate failures to project layouts.
 */
export type ClassNameDetectionStrategy =
    | 'mavenStandard'   // <ws>/src/main/java
    | 'gradleStandard'  // <ws>/src/main/java (same path, different driver)
    | 'vscodeSrc'       // <ws>/src
    | 'workspaceRoot';  // <ws>/

/**
 * Coarse OS classification. Kept as a closed enum so we can slice telemetry
 * by platform without depending on Common Schema `common.os` (which is
 * stripped by some downstream telemetry filters).
 */
export type OperatingSystem = 'win32' | 'darwin' | 'linux' | 'other';

/**
 * The outermost reason an invocation ended without emitting any of the
 * regular outcome events. Used by the InvocationGuard to close the loop on
 * silently-returning paths.
 */
export type SentinelOutcome =
    | 'silentReturn'      // The invoke function returned without recording an outcome.
    | 'cancelled'         // CancellationToken fired before any outcome was recorded.
    | 'exception';        // An unhandled exception propagated out of invoke.

export type TargetType = 'mainClass' | 'jar' | 'rawArgs' | 'unknown';

export type BreakpointKind =
    | 'line'
    | 'conditional'
    | 'hitCount'
    | 'logpoint';

export type StepKind = 'in' | 'out' | 'over' | 'continue' | 'pause' | 'unknown';

export type EvalContext = 'watch' | 'repl' | 'hover' | 'unknown';

export type RemoveBreakpointScope = 'all' | 'file' | 'line';

export type ScopeType = 'local' | 'static' | 'all' | 'unknown';

export const TOOL_NAMES = {
    DEBUG_JAVA_APPLICATION: 'debug_java_application',
    SET_JAVA_BREAKPOINT: 'set_java_breakpoint',
    DEBUG_STEP_OPERATION: 'debug_step_operation',
    GET_DEBUG_VARIABLES: 'get_debug_variables',
    GET_DEBUG_STACK_TRACE: 'get_debug_stack_trace',
    EVALUATE_DEBUG_EXPRESSION: 'evaluate_debug_expression',
    GET_DEBUG_THREADS: 'get_debug_threads',
    REMOVE_JAVA_BREAKPOINTS: 'remove_java_breakpoints',
    STOP_DEBUG_SESSION: 'stop_debug_session',
    GET_DEBUG_SESSION_INFO: 'get_debug_session_info',
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];

// ============================================================================
// Classifiers — pure functions; emit ONLY enums
// ============================================================================

/**
 * Classify the `target` parameter of `debug_java_application` into a coarse
 * shape category. The original string is consumed in-memory only; the
 * returned enum is the only thing that may be logged.
 */
export function classifyTarget(target: string | undefined | null): TargetType {
    if (!target) {
        return 'unknown';
    }
    const trimmed = target.trim();
    if (!trimmed) {
        return 'unknown';
    }
    if (trimmed.startsWith('-')) {
        return 'rawArgs';
    }
    if (/\.jar(\s|$)/i.test(trimmed) || trimmed.toLowerCase().endsWith('.jar')) {
        return 'jar';
    }
    if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(trimmed)) {
        return 'mainClass';
    }
    return 'unknown';
}

/**
 * Map an arbitrary error (Error, string, or unknown) to an ErrorCategory.
 * The original message and stack trace are consumed in-memory and never
 * returned. Unrecognised errors map to `'other'`.
 */
export function classifyError(err: unknown): ErrorCategory {
    if (err === undefined || err === null) {
        return 'other';
    }
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (!msg) {
        return 'other';
    }
    if (msg.includes('mainclass') && (msg.includes('not set') || msg.includes('missing') || msg.includes('not configured'))) {
        return 'mainClassMissing';
    }
    if (msg.includes('could not find or load main class') || msg.includes('classnotfound')) {
        return 'mainClassMissing';
    }
    if (msg.includes('classpath') && (msg.includes('not resolve') || msg.includes('unresolved') || msg.includes('cannot resolve'))) {
        return 'classpathUnresolved';
    }
    if (msg.includes('compilation') && msg.includes('fail')) {
        return 'buildFailure';
    }
    if (msg.includes('build failed') || msg.includes('build error')) {
        return 'buildFailure';
    }
    if (msg.includes('project not detected') || msg.includes('no project found')) {
        return 'projectNotDetected';
    }
    if (msg.includes('already running') || msg.includes('session is active')) {
        return 'sessionAlreadyRunning';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
        return 'timeout';
    }
    if (msg.includes('language server not ready') || msg.includes('jdt.ls')) {
        return 'lsNotReady';
    }
    if (msg.includes('no active debug session') || msg.includes('no debug session')) {
        return 'noActiveSession';
    }
    if (msg.includes('not suspended') || msg.includes('thread is not paused')) {
        return 'noSuspendedThread';
    }
    if (msg.includes('cancel')) {
        return 'cancelled';
    }
    return 'other';
}

/**
 * Classify a `set_java_breakpoint` invocation into a coarse breakpoint kind.
 * The actual filePath / lineNumber / condition strings are NOT logged; this
 * classifier only checks which optional inputs are present.
 */
export function classifyBreakpoint(input: {
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
}): BreakpointKind {
    if (input.logMessage && input.logMessage.length > 0) {
        return 'logpoint';
    }
    if (input.hitCondition && input.hitCondition.length > 0) {
        return 'hitCount';
    }
    if (input.condition && input.condition.length > 0) {
        return 'conditional';
    }
    return 'line';
}

export function classifyStep(operation: string | undefined): StepKind {
    switch (operation) {
        case 'stepIn':
            return 'in';
        case 'stepOut':
            return 'out';
        case 'stepOver':
            return 'over';
        case 'continue':
            return 'continue';
        case 'pause':
            return 'pause';
        default:
            return 'unknown';
    }
}

export function classifyEvalContext(context: string | undefined): EvalContext {
    switch (context) {
        case 'watch':
        case 'repl':
        case 'hover':
            return context;
        default:
            return 'unknown';
    }
}

export function classifyRemoveScope(input: {
    filePath?: string;
    lineNumber?: number;
}): RemoveBreakpointScope {
    if (!input.filePath) {
        return 'all';
    }
    if (input.lineNumber !== undefined) {
        return 'line';
    }
    return 'file';
}

export function classifyScopeType(scopeType: string | undefined): ScopeType {
    switch (scopeType) {
        case 'local':
        case 'static':
        case 'all':
            return scopeType;
        default:
            return 'unknown';
    }
}

/**
 * Coerce a Node `process.platform` string into the closed {@link OperatingSystem}
 * enum so telemetry sliced by `os` always matches `common.os` semantics.
 */
export function classifyPlatform(platform: string | undefined): OperatingSystem {
    switch (platform) {
        case 'win32':
        case 'darwin':
        case 'linux':
            return platform;
        default:
            return 'other';
    }
}

/**
 * Extract the Java major version from a `java -version` (or
 * `Runtime.version()`) style string. Returns `'unknown'` when the input
 * is empty or unrecognised. Examples:
 *   "21.0.1"          -> "21"
 *   "1.8.0_392"       -> "8"
 *   "17.0.5+9"        -> "17"
 *   "openjdk 21 2023" -> "21"
 *
 * Only the major version is emitted so we cannot fingerprint a build.
 */
export function classifyJavaMajorVersion(versionString: string | undefined | null): string {
    if (!versionString) {
        return 'unknown';
    }
    const trimmed = String(versionString).trim();
    if (!trimmed) {
        return 'unknown';
    }
    // Legacy "1.X" naming (Java 8 and earlier).
    const legacy = trimmed.match(/(?:^|\s|"|\()1\.(\d+)(?:[._]|$)/);
    if (legacy) {
        return legacy[1];
    }
    // Modern major-only naming, e.g. "21", "21.0.1", "openjdk 17".
    const modern = trimmed.match(/(?:^|\s|"|\()(\d{1,3})(?:[.+_]|$|\s)/);
    if (modern) {
        return modern[1];
    }
    return 'unknown';
}

// ============================================================================
// Recording helpers — the only entrypoints to `sendInfo` inside LMT code
// ============================================================================

/** Safe value types allowed as telemetry properties. */
type SafeValue = string | number | boolean | undefined;

/**
 * Tighten what sendInfo accepts. All values must be primitive enums /
 * booleans / numbers / well-known opaque IDs. Objects and arrays are
 * rejected at the type level so we cannot accidentally serialise a payload
 * containing user data.
 */
function sanitizedSend(properties: Record<string, SafeValue>): void {
    const clean: { [key: string]: string } = {};
    for (const [k, v] of Object.entries(properties)) {
        if (v === undefined) {
            continue;
        }
        clean[k] = typeof v === 'string' ? v : String(v);
    }
    sendInfo('', clean);
}

export interface ToolInvocationRecord {
    tool: ToolName;
    outcome: ToolOutcome;
    errorCategory?: ErrorCategory;
    durationMs?: number;
    /**
     * Optional tool-specific enum fields. ONLY enums / booleans / numbers
     * are accepted; the recorder itself is typed to forbid raw strings.
     */
    targetType?: TargetType;
    breakpointKind?: BreakpointKind;
    stepKind?: StepKind;
    evalContext?: EvalContext;
    removeScope?: RemoveBreakpointScope;
    scopeType?: ScopeType;
    isPaused?: boolean;
    skipBuild?: boolean;
    hasFilter?: boolean;
    frameCount?: number;
    threadCount?: number;
    suspendedCount?: number;
    removedCount?: number;
    /** Opaque GUID assigned by VS Code; safe to log. */
    sessionId?: string;
    /** vscode-java-debug's own adapter type — value is constant `'java'`. */
    sessionType?: string;
    /**
     * Cross-cutting diagnostic context. These are redundant with Common
     * Schema fields (`common.os`, etc.) but are emitted explicitly so
     * dashboards can slice without a join and downstream telemetry
     * filters do not strip them.
     */
    os?: OperatingSystem;
    /** Java major version e.g. "21", "17", "8". Use `'unknown'` if not yet probed. */
    javaMajorVersion?: string;
    /** Project flavour detected at launch time; same enum as launch-internal events. */
    projectSystem?: LaunchProjectType;
    /**
     * Retry instrumentation. `retryCount` is 0 for the first attempt within
     * a VS Code session for this tool, 1 for the next, etc.
     * `previousOutcome` is the terminal outcome of the immediately previous
     * attempt, so we can distinguish auto-retry (LM driven, immediate) from
     * user-driven retry (after editing code).
     */
    retryCount?: number;
    previousOutcome?: ToolOutcome;
}

/**
 * Record a single tool-invocation outcome. Replaces ad-hoc `sendInfo`
 * calls inside individual tools.
 *
 * Before sending, the record is normalized so that `outcome` and
 * `errorCategory` stay aligned for the six shared terminal values
 * (cancelled / timeout / lsNotReady / noActiveSession / noSuspendedThread /
 * noStackFrame). See {@link normalizeToolInvocationRecord}.
 */
export function recordToolInvocation(record: ToolInvocationRecord): void {
    const normalized = normalizeToolInvocationRecord(record);
    /* __GDPR__
       "languageModelTool.<tool>.invoke" : {
           "owner": "vscode-java-debug",
           "comment": "Outcome of a single Language Model Tool invocation.",
           "operationName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "errorCategory": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
           "durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
           "targetType": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "breakpointKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "stepKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "evalContext": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "removeScope": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "scopeType": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "isPaused": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "skipBuild": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "hasFilter": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "frameCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
           "threadCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
           "suspendedCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
           "removedCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
           "sessionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "sessionType": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "os": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "javaMajorVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "projectSystem": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "retryCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
           "previousOutcome": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
       }
     */
    sanitizedSend({
        operationName: `languageModelTool.${normalized.tool}.invoke`,
        outcome: normalized.outcome,
        errorCategory: normalized.errorCategory,
        durationMs: normalized.durationMs,
        targetType: normalized.targetType,
        breakpointKind: normalized.breakpointKind,
        stepKind: normalized.stepKind,
        evalContext: normalized.evalContext,
        removeScope: normalized.removeScope,
        scopeType: normalized.scopeType,
        isPaused: normalized.isPaused,
        skipBuild: normalized.skipBuild,
        hasFilter: normalized.hasFilter,
        frameCount: normalized.frameCount,
        threadCount: normalized.threadCount,
        suspendedCount: normalized.suspendedCount,
        removedCount: normalized.removedCount,
        sessionId: normalized.sessionId,
        sessionType: normalized.sessionType,
        os: normalized.os,
        javaMajorVersion: normalized.javaMajorVersion,
        projectSystem: normalized.projectSystem,
        retryCount: normalized.retryCount,
        previousOutcome: normalized.previousOutcome,
    });
}

/**
 * Values that exist in both {@link ToolOutcome} and {@link ErrorCategory}.
 * For these, the two fields must stay in lock-step so dashboard queries
 * filtering on either one produce identical results.
 */
const SHARED_TERMINAL_VALUES = [
    'cancelled',
    'timeout',
    'lsNotReady',
    'noActiveSession',
    'noSuspendedThread',
    'noStackFrame',
] as const;

type SharedTerminal = typeof SHARED_TERMINAL_VALUES[number];

function isSharedTerminal(value: string | undefined): value is SharedTerminal {
    return value !== undefined && (SHARED_TERMINAL_VALUES as readonly string[]).includes(value);
}

/**
 * Reconcile `outcome` and `errorCategory` for the six shared terminal
 * values so downstream queries can rely on either field. Returns a NEW
 * record; the input is not mutated.
 *
 * Rules:
 *  - If `errorCategory` is a shared terminal value, promote `outcome` to
 *    that value (callers that only set `errorCategory` get a consistent
 *    `outcome` for free).
 *  - If `outcome` is a shared terminal value and `errorCategory` is
 *    absent, fill it with the matching value (callers that only set
 *    `outcome` get a consistent `errorCategory`).
 */
function normalizeToolInvocationRecord(record: ToolInvocationRecord): ToolInvocationRecord {
    let outcome: ToolOutcome = record.outcome;
    let errorCategory: ErrorCategory | undefined = record.errorCategory;

    if (isSharedTerminal(errorCategory)) {
        outcome = errorCategory;
    } else if (isSharedTerminal(outcome) && errorCategory === undefined) {
        errorCategory = outcome;
    }

    return { ...record, outcome, errorCategory };
}

export interface ChatActivationRecord {
    javaLSReadyAtActivation: boolean;
    lmtCount: number;
    chatSkillsCount: number;
    chatInstructionsCount: number;
    extensionVersion: string;
}

/**
 * Record a one-shot snapshot of the chat-activation surface at the moment
 * Language Model Tools are registered. Lets us measure adoption coverage
 * post-ship without per-turn cost.
 */
export function recordChatActivation(record: ChatActivationRecord): void {
    /* __GDPR__
       "languageModelTool.chatActivationSnapshot" : {
           "owner": "vscode-java-debug",
           "comment": "Emitted once at Language Model Tool registration time; reports adoption surface.",
           "operationName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "javaLSReadyAtActivation": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "lmtCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
           "chatSkillsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
           "chatInstructionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
           "extensionVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
       }
     */
    sanitizedSend({
        operationName: 'languageModelTool.chatActivationSnapshot',
        javaLSReadyAtActivation: record.javaLSReadyAtActivation,
        lmtCount: record.lmtCount,
        chatSkillsCount: record.chatSkillsCount,
        chatInstructionsCount: record.chatInstructionsCount,
        extensionVersion: record.extensionVersion,
    });
}

/**
 * Project type detected by the launch flow. Free-form values are
 * forbidden so this stays a closed enum.
 */
export type LaunchProjectType = 'maven' | 'gradle' | 'vscode' | 'unknown';

/**
 * Discriminated union of every launch-flow internal event the recorder
 * is allowed to emit. Each variant lists its allowed properties so the
 * type system rejects unknown event names and unknown property keys.
 *
 * Note: `sessionId` here is VS Code's opaque debug-session GUID, never
 * the user-visible `launch.json` session name.
 *
 * Sentinel / silentReturn / cancelled / exception are the closed-loop
 * variants emitted by {@link InvocationGuard}: they guarantee that every
 * `debug_java_application` invocation produces at least one terminal
 * event, even on code paths that previously silently returned.
 */
export type LaunchInternalEvent =
    | { name: 'cleanupExistingSession'; sessionId: string }
    | { name: 'cleanupExistingSessionFailed'; errorCategory: ErrorCategory }
    | { name: 'debugSessionStarted.eventBased'; sessionId: string; elapsedMs?: number; thresholdMs?: number }
    | { name: 'debugSessionTimeout.eventBased'; elapsedMs?: number; thresholdMs?: number }
    | { name: 'debugSessionDetected'; sessionId: string; elapsedMs: number }
    | { name: 'debugSessionTimeout.smartPolling'; maxWaitTime: number; elapsedMs?: number }
    | { name: 'classNameDetection'; projectType: LaunchProjectType; detected: boolean }
    | {
          name: 'classNameDetection.failed';
          projectType: LaunchProjectType;
          strategy: ClassNameDetectionStrategy;
          failureReason: ClassNameDetectionFailure;
      }
    | { name: 'getDebugSessionInfo.threadError'; errorCategory: ErrorCategory }
    | { name: 'debugSession.sentinel'; os: OperatingSystem; javaMajorVersion: string; projectSystem?: LaunchProjectType }
    | { name: 'debugSession.silentReturn'; durationMs: number }
    | { name: 'debugSession.cancelled'; durationMs: number }
    | { name: 'debugSession.exception'; errorCategory: ErrorCategory; durationMs: number };

/**
 * Internal-debug event for the launch-flow nested instrumentation
 * (session-detected / cleanup / timeout). Re-uses the sanitised sender so
 * no PII can slip in. Accepts only the discriminated-union shapes defined
 * in {@link LaunchInternalEvent} — unknown event names or unexpected
 * property keys are rejected at compile time.
 */
export function recordLaunchInternal(event: LaunchInternalEvent): void {
    const { name, ...properties } = event;
    /* __GDPR__
       "languageModelTool.<launchInternalEventName>" : {
           "owner": "vscode-java-debug",
           "comment": "Internal launch-flow instrumentation; one of the LaunchInternalEvent variants.",
           "operationName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "sessionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "errorCategory": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
           "elapsedMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
           "thresholdMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
           "maxWaitTime": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
           "durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
           "projectType": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "projectSystem": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "detected": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "strategy": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "failureReason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
           "os": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
           "javaMajorVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
       }
     */
    sanitizedSend({
        operationName: `languageModelTool.${name}`,
        ...properties,
    });
}

// ============================================================================
// InvocationGuard — closed-loop sentinel for debug_java_application
// ============================================================================
//
// Background: dashboards show ~33 % of `debug_java_application` invocations
// produce NO terminal event (neither started / timeout / cleanup / classname
// failed). The cause is silent-return paths inside the invoke handler. This
// guard wraps the handler so that any code path that exits without recording
// an outcome emits `debugSession.silentReturn`, and exceptions / cancellation
// are surfaced as their own dedicated events.
//
// Usage:
//   const guard = beginDebugSessionInvocation(context, retryContext);
//   try {
//       const result = await actualWork();
//       guard.markOutcomeRecorded();   // call this whenever a regular event has fired
//       return result;
//   } catch (e) {
//       guard.markException(e);
//       throw e;
//   } finally {
//       guard.close();                  // emits silentReturn / cancelled if needed
//   }
//
// The guard is intentionally NOT a try/finally helper itself so callers can
// keep their existing control flow and let the type system check that
// `markOutcomeRecorded` is reached on the happy path.

export interface InvocationContext {
    os: OperatingSystem;
    javaMajorVersion: string;
    projectSystem?: LaunchProjectType;
    /** Cancellation token; checked when the guard closes so we can emit `cancelled` instead of `silentReturn`. */
    isCancelled: () => boolean;
}

export interface InvocationGuard {
    /** Mark that some other terminal event (`started`, `timeout`, `classNameDetection.failed`, ...) was emitted. */
    markOutcomeRecorded(): void;
    /** Mark that an unhandled exception is about to propagate. Pre-computes the errorCategory. */
    markException(err: unknown): void;
    /** Always call from `finally`. Emits a closing event if nothing else did. */
    close(): void;
}

/**
 * Open an InvocationGuard for a `debug_java_application` call. Immediately
 * emits a `debugSession.sentinel` event so we have a complete invocation
 * count even if everything downstream fails.
 */
export function beginDebugSessionInvocation(context: InvocationContext): InvocationGuard {
    const startedAt = Date.now();
    recordLaunchInternal({
        name: 'debugSession.sentinel',
        os: context.os,
        javaMajorVersion: context.javaMajorVersion,
        projectSystem: context.projectSystem,
    });

    let outcomeRecorded = false;
    let exceptionCategory: ErrorCategory | undefined;

    return {
        markOutcomeRecorded(): void {
            outcomeRecorded = true;
        },
        markException(err: unknown): void {
            exceptionCategory = classifyError(err);
        },
        close(): void {
            if (outcomeRecorded) {
                return;
            }
            const durationMs = Date.now() - startedAt;
            if (exceptionCategory !== undefined) {
                recordLaunchInternal({
                    name: 'debugSession.exception',
                    errorCategory: exceptionCategory,
                    durationMs,
                });
                return;
            }
            if (context.isCancelled()) {
                recordLaunchInternal({
                    name: 'debugSession.cancelled',
                    durationMs,
                });
                return;
            }
            recordLaunchInternal({
                name: 'debugSession.silentReturn',
                durationMs,
            });
        },
    };
}

// ============================================================================
// SessionInvocationTracker — per-VS-Code-session retry attribution
// ============================================================================
//
// We want each `recordToolInvocation` to carry `retryCount` (0-based) and
// `previousOutcome` so we can distinguish:
//   - LM auto-retry (immediate, same session, previous outcome = timeout/failure)
//   - User-driven retry (delayed, possibly different inputs)
//   - First attempt
//
// The tracker is in-process only (lifetime = VS Code window) and stores no
// user-identifying data — it remembers only the previous outcome enum per
// tool name.

interface ToolAttempt {
    count: number;
    previousOutcome?: ToolOutcome;
}

const sessionAttempts = new Map<ToolName, ToolAttempt>();

/**
 * Return the retry attribution for the next invocation of `tool`. Always
 * call BEFORE the actual work so the returned `retryCount` reflects the
 * attempt about to happen (0 for the first call).
 */
export function nextAttempt(tool: ToolName): { retryCount: number; previousOutcome?: ToolOutcome } {
    const prev = sessionAttempts.get(tool);
    return {
        retryCount: prev?.count ?? 0,
        previousOutcome: prev?.previousOutcome,
    };
}

/**
 * Record the terminal outcome of an attempt so the next call to
 * {@link nextAttempt} can return the updated retry context.
 */
export function completeAttempt(tool: ToolName, outcome: ToolOutcome): void {
    const prev = sessionAttempts.get(tool);
    sessionAttempts.set(tool, {
        count: (prev?.count ?? 0) + 1,
        previousOutcome: outcome,
    });
}

/**
 * Test-only helper: reset the attempt map. Production code should never
 * call this — VS Code session lifetime IS the intended scope.
 */
export function __resetAttemptsForTests(): void {
    sessionAttempts.clear();
}
