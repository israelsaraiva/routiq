export interface Scheduler {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemScheduler: Scheduler = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class StopSignal {
  private stoppedFlag = false;
  private wake: (() => void) | undefined;

  get stopped(): boolean {
    return this.stoppedFlag;
  }

  stop(): void {
    this.stoppedFlag = true;
    this.wake?.();
  }

  async sleep(scheduler: Scheduler, ms: number): Promise<void> {
    if (ms <= 0 || this.stoppedFlag) {
      return;
    }
    const interrupted = new Promise<void>((resolve) => (this.wake = resolve));
    await Promise.race([scheduler.sleep(ms), interrupted]);
    this.wake = undefined;
  }
}

export function messageIntervalMs(delayMs: number, ratePerSecond: number): number {
  const rateInterval = ratePerSecond > 0 ? 1000 / ratePerSecond : 0;
  return Math.max(delayMs > 0 ? delayMs : 0, rateInterval);
}

export interface PacedRun {
  count: number;
  intervalMs: number;
  scheduler: Scheduler;
  signal: StopSignal;
  step(index: number): Promise<void>;
}

export async function runPaced({ count, intervalMs, scheduler, signal, step }: PacedRun): Promise<number> {
  const startedAt = scheduler.now();
  let completed = 0;
  for (let index = 0; index < count && !signal.stopped; index++) {
    await step(index);
    completed++;
    const isLast = index === count - 1;
    isLast || (await signal.sleep(scheduler, startedAt + (index + 1) * intervalMs - scheduler.now()));
  }
  return completed;
}

export interface RepeatedRuns {
  runs: number;
  intervalMs: number;
  scheduler: Scheduler;
  signal: StopSignal;
  runOnce(run: number): Promise<void>;
}

export async function runRepeated({ runs, intervalMs, scheduler, signal, runOnce }: RepeatedRuns): Promise<void> {
  for (let run = 1; run <= runs && !signal.stopped; run++) {
    await runOnce(run);
    run < runs && (await signal.sleep(scheduler, intervalMs));
  }
}
