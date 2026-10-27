import { describe, expect, it } from 'vitest';
import { RequestRunResult, RunSummary } from '../core/collectionRunner';
import { INITIAL_RUNNER_STATE, describeSummary, isRunning, reduceRunner, resultBadge } from './runnerState';

const result: RequestRunResult = {
  requestId: 'a', name: 'a', method: 'GET', path: '', mode: 'http', status: 200, statusText: 'OK', timeMs: 5, passed: true, tests: [], scriptErrors: [], console: [],
};
const summary: RunSummary = { total: 3, executed: 1, skipped: 1, passed: 1, failed: 0, testsPassed: 2, testsFailed: 1, durationMs: 42, stopped: true };

describe('reduceRunner', () => {
  it('collects results between start and done', () => {
    const started = reduceRunner(INITIAL_RUNNER_STATE, { type: 'start', title: 'T', total: 3, delayMs: 0 });
    expect(isRunning(started)).toBe(true);
    const withResult = reduceRunner(started, { type: 'result', index: 0, result });
    expect(withResult.results).toHaveLength(1);
    const done = reduceRunner(withResult, { type: 'done', summary });
    expect(isRunning(done)).toBe(false);
  });

  it('resets earlier results when a new run starts', () => {
    const state = { ...INITIAL_RUNNER_STATE, results: [result] };
    expect(reduceRunner(state, { type: 'start', title: 'T', total: 1, delayMs: 0 }).results).toEqual([]);
  });
});

describe('describeSummary', () => {
  it('reports counts, total time, skipped and stopped runs', () => {
    expect(describeSummary(summary)).toEqual(['1 passed', '0 failed', '2/3 tests', '42 ms total', '1 skipped', 'stopped after 2 of 3']);
  });
});

describe('resultBadge', () => {
  it('labels skipped streaming, grpc status and http status', () => {
    expect(resultBadge({ ...result, mode: 'skipped', statusText: 'skipped (streaming)' })).toEqual({ label: 'skipped (streaming)', variant: 'outline' });
    expect(resultBadge({ ...result, mode: 'grpc', statusText: 'OK' })).toEqual({ label: 'OK', variant: 'success' });
    expect(resultBadge({ ...result, passed: false, error: 'x' })).toEqual({ label: 'error', variant: 'destructive' });
    expect(resultBadge(result).label).toBe('200 OK');
  });
});
