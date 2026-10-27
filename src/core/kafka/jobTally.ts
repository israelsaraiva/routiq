import { KafkaJobKind, KafkaJobOutcome, KafkaJobProgress, KafkaJobState } from '../../shared/kafkaProduceTypes';

const RECENT_LIMIT = 10;
const ERROR_LIMIT = 5;

export class JobTally {
  private sent = 0;
  private failed = 0;
  private run = 1;
  private readonly partitionCounts: Record<string, number> = {};
  private readonly errors: string[] = [];
  private recent: KafkaJobOutcome[] = [];

  constructor(
    readonly jobId: string,
    private readonly kind: KafkaJobKind,
    private readonly topic: string,
    private readonly total: number,
    private readonly runs = 1,
  ) {}

  startRun(run: number): void {
    this.run = run;
  }

  record(outcome: KafkaJobOutcome): void {
    outcome.ok ? this.countSent(outcome) : this.countFailure(outcome);
    this.recent = [...this.recent, outcome].slice(-RECENT_LIMIT);
  }

  snapshot(state: KafkaJobState, detail?: string): KafkaJobProgress {
    const { jobId, kind, topic, total, runs, run, sent, failed, partitionCounts, errors, recent } = this;
    return { jobId, kind, state, topic, sent, failed, total, run, runs, partitionCounts: { ...partitionCounts }, errors: [...errors], recent, detail };
  }

  private countSent({ partition }: KafkaJobOutcome): void {
    this.sent++;
    partition !== undefined && (this.partitionCounts[partition] = (this.partitionCounts[partition] ?? 0) + 1);
  }

  private countFailure({ error }: KafkaJobOutcome): void {
    this.failed++;
    error && !this.errors.includes(error) && this.errors.length < ERROR_LIMIT && this.errors.push(error);
  }
}
