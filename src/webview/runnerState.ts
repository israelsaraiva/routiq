import { RequestRunResult, RunSummary } from '../core/collectionRunner';
import { RunnerHostMessage } from '../core/runnerMessages';

export interface RunnerState {
  title: string;
  total: number;
  delayMs: number;
  started: boolean;
  results: RequestRunResult[];
  summary?: RunSummary;
}

export const INITIAL_RUNNER_STATE: RunnerState = { title: 'Collection run', total: 0, delayMs: 0, started: false, results: [] };

export function reduceRunner(state: RunnerState, message: RunnerHostMessage): RunnerState {
  if (message.type === 'start') {
    return { ...INITIAL_RUNNER_STATE, title: message.title, total: message.total, delayMs: message.delayMs, started: true };
  }
  if (message.type === 'result') {
    return { ...state, results: [...state.results, message.result] };
  }
  return { ...state, summary: message.summary };
}

export function isRunning(state: RunnerState): boolean {
  return state.started && state.summary === undefined;
}

export function describeProgress(state: RunnerState): string {
  if (!state.started) {
    return 'Waiting for the run to start…';
  }
  const delay = state.delayMs > 0 ? ` with ${state.delayMs} ms delay` : '';
  return `Running ${state.results.length}/${state.total} request(s)${delay}…`;
}

export function describeSummary(summary: RunSummary): string[] {
  const parts = [
    `${summary.passed} passed`,
    `${summary.failed} failed`,
    `${summary.testsPassed}/${summary.testsPassed + summary.testsFailed} tests`,
    `${summary.durationMs} ms total`,
  ];
  if (summary.skipped > 0) {
    parts.push(`${summary.skipped} skipped`);
  }
  if (summary.stopped) {
    parts.push(`stopped after ${summary.executed + summary.skipped} of ${summary.total}`);
  }
  return parts;
}

export function resultBadge(result: RequestRunResult): { label: string; variant: 'success' | 'destructive' | 'outline' } {
  if (result.mode === 'skipped') {
    return { label: result.statusText, variant: 'outline' };
  }
  const label = result.error ? 'error' : result.mode === 'grpc' ? result.statusText : `${result.status} ${result.statusText}`.trim();
  return { label, variant: result.passed ? 'success' : 'destructive' };
}
