import { CollectionEntry, RequestModel, ResponseModel, ScriptsOutcome } from '../shared/types';
import { isFolder } from './collectionTree';
import { describeRequest, isStreamingRequest, requestKindOf } from './requestKinds';

export type RunMode = 'http' | 'grpc' | 'skipped';

export const SKIPPED_STREAMING_LABEL = 'skipped (streaming)';

export const GRPC_RUN_MESSAGE_CAP = 20;

export interface RunnableRequest {
  request: RequestModel;
  path: string;
  mode: RunMode;
}

export interface RequestRunResult {
  requestId: string;
  name: string;
  method: string;
  path: string;
  mode: RunMode;
  status: number;
  statusText: string;
  timeMs: number;
  passed: boolean;
  error?: string;
  tests: ScriptsOutcome['tests'];
  scriptErrors: string[];
  console: ScriptsOutcome['console'];
  messages?: string[];
  messagesCapped?: boolean;
}

export interface RunSummary {
  total: number;
  executed: number;
  skipped: number;
  passed: number;
  failed: number;
  testsPassed: number;
  testsFailed: number;
  durationMs: number;
  stopped: boolean;
}

function runModeOf(request: RequestModel): RunMode {
  const kind = requestKindOf(request);
  if (kind === 'grpc') {
    return 'grpc';
  }
  return isStreamingRequest(request) ? 'skipped' : 'http';
}

export function collectRunnableRequests(items: CollectionEntry[], parentPath = ''): RunnableRequest[] {
  return items.flatMap((entry) => {
    if (isFolder(entry)) {
      return collectRunnableRequests(entry.items, parentPath ? `${parentPath} / ${entry.name}` : entry.name);
    }
    return [{ request: entry, path: parentPath, mode: runModeOf(entry) }];
  });
}

export function buildRunResult({ request, path, mode }: RunnableRequest, response: ResponseModel, outcome: ScriptsOutcome): RequestRunResult {
  const testsFailed = outcome.tests.some((test) => !test.passed);
  return {
    requestId: request.id,
    name: request.name,
    method: describeRequest(request),
    path,
    mode,
    status: response.status,
    statusText: response.statusText,
    timeMs: response.timeMs,
    passed: !response.error && !testsFailed && outcome.errors.length === 0,
    ...(response.error ? { error: response.error } : {}),
    tests: outcome.tests,
    scriptErrors: outcome.errors,
    console: outcome.console,
  };
}

export function buildSkippedResult({ request, path }: RunnableRequest): RequestRunResult {
  return {
    requestId: request.id,
    name: request.name,
    method: describeRequest(request),
    path,
    mode: 'skipped',
    status: 0,
    statusText: SKIPPED_STREAMING_LABEL,
    timeMs: 0,
    passed: true,
    tests: [],
    scriptErrors: [],
    console: [],
  };
}

export interface GrpcRunOutcome {
  statusCode: number;
  statusName: string;
  details: string;
  timeMs: number;
  messages: string[];
  messagesCapped: boolean;
  error?: string;
}

export function buildGrpcRunResult({ request, path, mode }: RunnableRequest, outcome: GrpcRunOutcome): RequestRunResult {
  const failed = outcome.error !== undefined || (outcome.statusCode !== 0 && !outcome.messagesCapped);
  const error = outcome.error ?? (failed ? `${outcome.statusName}${outcome.details ? `: ${outcome.details}` : ''}` : undefined);
  return {
    requestId: request.id,
    name: request.name,
    method: describeRequest(request),
    path,
    mode,
    status: outcome.statusCode,
    statusText: outcome.statusName,
    timeMs: outcome.timeMs,
    passed: !failed,
    ...(error ? { error } : {}),
    tests: [],
    scriptErrors: [],
    console: [],
    messages: outcome.messages,
    messagesCapped: outcome.messagesCapped,
  };
}

export function summarizeRun(results: RequestRunResult[], total: number, stopped: boolean, durationMs: number): RunSummary {
  const executedResults = results.filter((result) => result.mode !== 'skipped');
  const allTests = executedResults.flatMap((result) => result.tests);
  const passed = executedResults.filter((result) => result.passed).length;
  return {
    total,
    executed: executedResults.length,
    skipped: results.length - executedResults.length,
    passed,
    failed: executedResults.length - passed,
    testsPassed: allTests.filter((test) => test.passed).length,
    testsFailed: allTests.filter((test) => !test.passed).length,
    durationMs,
    stopped,
  };
}

export function normalizeDelayMs(value: unknown): number {
  const delay = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, delay);
}

export interface RunExport {
  title: string;
  exportedAt: string;
  summary: RunSummary;
  results: RequestRunResult[];
}

export function buildRunExport(title: string, summary: RunSummary, results: RequestRunResult[], exportedAt: Date): RunExport {
  return { title, exportedAt: exportedAt.toISOString(), summary, results };
}
