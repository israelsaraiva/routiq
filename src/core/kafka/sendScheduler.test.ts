import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StopSignal, messageIntervalMs, runPaced, runRepeated, systemScheduler } from './sendScheduler';

describe('messageIntervalMs', () => {
  it('uses the slowest of delay and rate', () => {
    expect(messageIntervalMs(0, 0)).toBe(0);
    expect(messageIntervalMs(50, 0)).toBe(50);
    expect(messageIntervalMs(0, 4)).toBe(250);
    expect(messageIntervalMs(100, 4)).toBe(250);
    expect(messageIntervalMs(500, 4)).toBe(500);
  });
});

describe('scheduling with fake timers', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('paces steps at the requested interval without trailing wait', async () => {
    const times: number[] = [];
    const start = Date.now();
    const done = runPaced({ count: 3, intervalMs: 100, scheduler: systemScheduler, signal: new StopSignal(), step: async () => void times.push(Date.now() - start) });
    await vi.advanceTimersByTimeAsync(250);
    expect(await done).toBe(3);
    expect(times).toEqual([0, 100, 200]);
  });

  it('does not wait when the interval is zero', async () => {
    const step = vi.fn(async () => undefined);
    expect(await runPaced({ count: 50, intervalMs: 0, scheduler: systemScheduler, signal: new StopSignal(), step })).toBe(50);
    expect(step).toHaveBeenCalledTimes(50);
  });

  it('stops mid-wait and returns the completed count', async () => {
    const signal = new StopSignal();
    const step = vi.fn(async () => undefined);
    const done = runPaced({ count: 10, intervalMs: 1000, scheduler: systemScheduler, signal, step });
    await vi.advanceTimersByTimeAsync(1500);
    signal.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(await done).toBe(2);
    expect(step).toHaveBeenCalledTimes(2);
  });

  it('repeats runs at an interval up to the cap', async () => {
    const runs: number[] = [];
    const done = runRepeated({ runs: 3, intervalMs: 1000, scheduler: systemScheduler, signal: new StopSignal(), runOnce: async (run) => void runs.push(run) });
    await vi.advanceTimersByTimeAsync(999);
    expect(runs).toEqual([1]);
    await vi.advanceTimersByTimeAsync(2001);
    await done;
    expect(runs).toEqual([1, 2, 3]);
  });

  it('stops repeating promptly when signalled during the interval', async () => {
    const signal = new StopSignal();
    const runOnce = vi.fn(async () => undefined);
    const done = runRepeated({ runs: 5, intervalMs: 60000, scheduler: systemScheduler, signal, runOnce });
    await vi.advanceTimersByTimeAsync(10);
    signal.stop();
    await done;
    expect(runOnce).toHaveBeenCalledTimes(1);
  });
});
