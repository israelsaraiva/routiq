export interface BatchScheduler {
  schedule(task: () => void): unknown;
  cancel(handle: unknown): void;
}

export const intervalScheduler = (delayMs: number): BatchScheduler => ({
  schedule: (task) => setTimeout(task, delayMs),
  cancel: (handle) => clearTimeout(handle as NodeJS.Timeout),
});

const FALLBACK_FRAME_MS = 16;

export const animationFrameScheduler: BatchScheduler = {
  schedule: (task) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(task) : setTimeout(task, FALLBACK_FRAME_MS)),
  cancel: (handle) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(handle as number) : clearTimeout(handle as NodeJS.Timeout)),
};

export class MessageBatcher<Item> {
  private pending: Item[] = [];
  private handle: unknown;
  private scheduled = false;

  constructor(
    private readonly onFlush: (batch: Item[]) => void,
    private readonly scheduler: BatchScheduler,
    private readonly maxPending: number,
  ) {}

  push(item: Item): void {
    this.pending.push(item);
    this.pending.length > this.maxPending && this.pending.splice(0, this.pending.length - this.maxPending);
    this.scheduleFlush();
  }

  flush(): void {
    this.cancelScheduled();
    const batch = this.pending;
    this.pending = [];
    batch.length > 0 && this.onFlush(batch);
  }

  discard(): void {
    this.cancelScheduled();
    this.pending = [];
  }

  private scheduleFlush(): void {
    if (!this.scheduled) {
      this.scheduled = true;
      this.handle = this.scheduler.schedule(() => this.flush());
    }
  }

  private cancelScheduled(): void {
    this.scheduled && this.scheduler.cancel(this.handle);
    this.scheduled = false;
  }
}
