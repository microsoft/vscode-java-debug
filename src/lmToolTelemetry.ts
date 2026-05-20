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
 */
export type LaunchInternalEvent =
    | { name: 'cleanupExistingSession'; sessionId: string }
    | { name: 'cleanupExistingSessionFailed'; errorCategory: ErrorCategory }
    | { name: 'debugSessionStarted.eventBased'; sessionId: string }
    | { name: 'debugSessionTimeout.eventBased' }
    | { name: 'debugSessionDetected'; sessionId: string; elapsedMs: number }
    | { name: 'debugSessionTimeout.smartPolling'; maxWaitTime: number }
    | { name: 'classNameDetection'; projectType: LaunchProjectType; detected: boolean }
    | { name: 'getDebugSessionInfo.threadError'; errorCategory: ErrorCategory };

/**
 * Internal-debug event for the launch-flow nested instrumentation
 * (session-detected / cleanup / timeout). Re-uses the sanitised sender so
 * no PII can slip in. Accepts only the discriminated-union shapes defined
 * in {@link LaunchInternalEvent} — unknown event names or unexpected
 * property keys are rejected at compile time.
 */
export function recordLaunchInternal(event: LaunchInternalEvent): void {
    const { name, ...properties } = event;
    sanitizedSend({
        operationName: `languageModelTool.${name}`,
        ...properties,
    });
}
