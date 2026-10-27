import { MessageChannel, Worker } from 'node:worker_threads';
import { MATCHER_NAMES, evaluateMatcher } from './assertions';
import { SCRIPT_WORKER_SOURCE } from './scriptWorkerSource';
import { ConsoleLevel, ScriptConsoleEntry, ScriptTestResult } from '../shared/types';

export interface ScriptRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export interface ScriptResponse {
  status: number;
  statusText: string;
  timeMs: number;
  headers: Record<string, string>;
  body: string;
}

export interface ScriptInput {
  variables: Record<string, string>;
  request?: ScriptRequest;
  response?: ScriptResponse;
}

export interface ScriptRunResult {
  tests: ScriptTestResult[];
  console: ScriptConsoleEntry[];
  variableChanges: Record<string, string>;
  request?: ScriptRequest;
  error?: string;
}

export function emptyScriptResult(request?: ScriptRequest): ScriptRunResult {
  return { tests: [], console: [], variableChanges: {}, request };
}

export const SCRIPT_RESOURCE_LIMITS = { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 };
const TERMINATION_GRACE_MS = 500;
const MATCHER_WAIT_MS = 2000;

type WorkerMessage = { type: 'match'; payload: string } | { type: 'result'; serialized: string } | { type: 'failure'; message: string };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function evaluateHostMatcher(payload: string): string {
  try {
    const request = JSON.parse(payload) as { name: unknown; actual: unknown; args: unknown; negated: unknown };
    const expectedArguments = Array.isArray(request.args) ? request.args : [];
    return JSON.stringify(evaluateMatcher(String(request.name), request.actual, expectedArguments, Boolean(request.negated)));
  } catch (error) {
    return JSON.stringify({ pass: false, message: `assertion failed to evaluate: ${describe(error)}` });
  }
}

export function describeWorkerError(error: unknown): string {
  const code = (error as { code?: string } | undefined)?.code;
  if (code === 'ERR_WORKER_OUT_OF_MEMORY') {
    return `Script exceeded the ${SCRIPT_RESOURCE_LIMITS.maxOldGenerationSizeMb} MB memory limit`;
  }
  return describe(error);
}

export async function runScript(source: string, input: ScriptInput, timeoutMs: number, signal?: AbortSignal): Promise<ScriptRunResult> {
  if (source.trim() === '') {
    return emptyScriptResult(input.request);
  }
  if (signal?.aborted) {
    return { ...emptyScriptResult(input.request), error: 'Script aborted' };
  }
  try {
    return await execute(source, input, timeoutMs, signal);
  } catch (error) {
    return { ...emptyScriptResult(input.request), error: describe(error) };
  }
}

function execute(source: string, input: ScriptInput, timeoutMs: number, abortSignal?: AbortSignal): Promise<ScriptRunResult> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const signalBuffer = new SharedArrayBuffer(4);
    const wakeFlag = new Int32Array(signalBuffer);
    const worker = new Worker(SCRIPT_WORKER_SOURCE, {
      eval: true,
      env: {},
      execArgv: [],
      stdout: true,
      stderr: true,
      resourceLimits: SCRIPT_RESOURCE_LIMITS,
      workerData: {
        source,
        serializedInput: JSON.stringify(input),
        matcherNames: MATCHER_NAMES,
        timeoutMs,
        matcherWaitMs: MATCHER_WAIT_MS,
        signalBuffer,
        replyPort: channel.port2,
      },
      transferList: [channel.port2],
    });
    let settled = false;
    const settle = (result: ScriptRunResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(deadline);
      abortSignal?.removeEventListener('abort', onAbort);
      channel.port1.close();
      void worker.terminate();
      resolve(result);
    };
    const fail = (message: string) => settle({ ...emptyScriptResult(input.request), error: message });
    const onAbort = () => fail('Script aborted');
    const deadline = setTimeout(() => fail(`Script execution timed out after ${timeoutMs}ms`), timeoutMs + TERMINATION_GRACE_MS);
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    worker.on('message', (message: WorkerMessage) => {
      if (message.type === 'match') {
        channel.port1.postMessage(evaluateHostMatcher(message.payload));
        Atomics.store(wakeFlag, 0, 1);
        Atomics.notify(wakeFlag, 0);
      } else if (message.type === 'result') {
        settle(parseResult(message.serialized, input.request));
      } else {
        fail(message.message);
      }
    });
    worker.on('error', (error) => fail(describeWorkerError(error)));
    worker.on('exit', () => fail('Script worker exited unexpectedly'));
  });
}

function parseResult(serialized: string, request?: ScriptRequest): ScriptRunResult {
  try {
    return parseOutput(serialized, request);
  } catch (error) {
    return { ...emptyScriptResult(request), error: describe(error) };
  }
}

function parseOutput(serialized: unknown, fallbackRequest?: ScriptRequest): ScriptRunResult {
  const parsed = JSON.parse(String(serialized)) as Record<string, unknown>;
  return {
    tests: toTests(parsed.tests),
    console: toConsoleEntries(parsed.console),
    variableChanges: toStringRecord(parsed.variables),
    request: fallbackRequest && toScriptRequest(parsed.request, fallbackRequest),
    error: typeof parsed.error === 'string' ? parsed.error : undefined,
  };
}

function toTests(value: unknown): ScriptTestResult[] {
  return asRecords(value).map((entry) => ({
    name: String(entry.name),
    passed: entry.passed === true,
    ...(typeof entry.message === 'string' ? { message: entry.message } : {}),
  }));
}

const CONSOLE_LEVELS: ConsoleLevel[] = ['log', 'info', 'warn', 'error'];

function toConsoleEntries(value: unknown): ScriptConsoleEntry[] {
  return asRecords(value).map((entry) => ({
    level: CONSOLE_LEVELS.includes(entry.level as ConsoleLevel) ? (entry.level as ConsoleLevel) : 'log',
    text: String(entry.text),
  }));
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null) : [];
}

function toStringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      result[key] = String(entry);
    }
  }
  return result;
}

function toScriptRequest(value: unknown, fallback: ScriptRequest): ScriptRequest {
  if (typeof value !== 'object' || value === null) {
    return fallback;
  }
  const candidate = value as Record<string, unknown>;
  return {
    url: typeof candidate.url === 'string' ? candidate.url : fallback.url,
    method: typeof candidate.method === 'string' ? candidate.method : fallback.method,
    headers: typeof candidate.headers === 'object' && candidate.headers !== null ? toStringRecord(candidate.headers) : fallback.headers,
    body: typeof candidate.body === 'string' ? candidate.body : fallback.body,
  };
}
