import { KafkaConnectionConfig, describeKafkaError } from '../core/kafka/connection';
import { JobTally } from '../core/kafka/jobTally';
import { ReplayRecord } from '../core/kafka/replayPlan';
import { Scheduler, StopSignal, messageIntervalMs, runPaced, runRepeated, systemScheduler } from '../core/kafka/sendScheduler';
import { totalMessages } from '../core/kafka/sendJob';
import { resolveMessageTemplate } from '../core/kafka/sendTemplate';
import { DynamicSources, systemDynamicSources } from '../core/variables';
import { KafkaJobProgress, KafkaReplayRequest, KafkaSendJobRequest } from '../shared/kafkaProduceTypes';
import { KafkaClientFactory, KafkaProducedRecord, KafkaProducerLike } from './kafkaClient';

const PRODUCER_CLIENT_ID = 'routiq-producer';
const PROGRESS_INTERVAL_MS = 100;
const MAX_CONSECUTIVE_FAILURES = 5;

export interface KafkaProducerJobsOptions {
  connectionTimeoutMs: number;
  scheduler?: Scheduler;
  sources?: DynamicSources;
}

export type ProgressListener = (progress: KafkaJobProgress) => void;

interface JobContext {
  producer: KafkaProducerLike;
  tally: JobTally;
  signal: StopSignal;
  failureStreak: number;
  abort(reason: string): void;
  reportProgress(): void;
}

export class KafkaProducerJobs {
  private readonly signals = new Map<string, StopSignal>();

  constructor(
    private readonly createClient: KafkaClientFactory,
    private readonly options: KafkaProducerJobsOptions,
  ) {}

  get runningCount(): number {
    return this.signals.size;
  }

  stop(jobId: string): void {
    this.signals.get(jobId)?.stop();
  }

  stopAll(): void {
    this.signals.forEach((signal) => signal.stop());
  }

  runSend(config: KafkaConnectionConfig, request: KafkaSendJobRequest, variables: Record<string, string>, onProgress: ProgressListener): Promise<KafkaJobProgress> {
    const runs = request.repeatIntervalMs > 0 ? request.repeatMaxRuns : 1;
    const tally = new JobTally(request.jobId, 'send', request.topic, totalMessages(request), runs);
    return this.execute(config, tally, onProgress, (context) => this.sendRuns(context, request, variables, runs));
  }

  runReplay(config: KafkaConnectionConfig, request: KafkaReplayRequest, records: ReplayRecord[], onProgress: ProgressListener): Promise<KafkaJobProgress> {
    const tally = new JobTally(request.jobId, 'replay', request.targetTopic.trim(), records.length);
    return this.execute(config, tally, onProgress, (context) => this.replayRecords(context, records, request.ratePerSecond));
  }

  private async execute(config: KafkaConnectionConfig, tally: JobTally, onProgress: ProgressListener, body: (context: JobContext) => Promise<void>): Promise<KafkaJobProgress> {
    const signal = new StopSignal();
    let abortReason: string | undefined;
    const context: JobContext = {
      producer: this.createClient(config, PRODUCER_CLIENT_ID, this.options.connectionTimeoutMs).createProducer(),
      tally,
      signal,
      failureStreak: 0,
      abort: (reason) => {
        abortReason = reason;
        signal.stop();
      },
      reportProgress: this.createThrottledReporter(tally, onProgress),
    };
    this.signals.set(tally.jobId, signal);
    try {
      await context.producer.connect();
      onProgress(tally.snapshot('running'));
      await body(context);
    } catch (error) {
      abortReason = describeKafkaError(error);
    } finally {
      this.signals.delete(tally.jobId);
      await context.producer.disconnect().catch(() => undefined);
    }
    const final = tally.snapshot(abortReason ? 'failed' : signal.stopped ? 'stopped' : 'done', abortReason);
    onProgress(final);
    return final;
  }

  private createThrottledReporter(tally: JobTally, onProgress: ProgressListener): () => void {
    const scheduler = this.options.scheduler ?? systemScheduler;
    let lastReportedAt = Number.NEGATIVE_INFINITY;
    return () => {
      const now = scheduler.now();
      if (now - lastReportedAt >= PROGRESS_INTERVAL_MS) {
        lastReportedAt = now;
        onProgress(tally.snapshot('running'));
      }
    };
  }

  private async sendRuns(context: JobContext, request: KafkaSendJobRequest, variables: Record<string, string>, runs: number): Promise<void> {
    const scheduler = this.options.scheduler ?? systemScheduler;
    const sources = this.options.sources ?? systemDynamicSources;
    const intervalMs = messageIntervalMs(request.delayMs, request.ratePerSecond);
    const template = { key: request.key, value: request.value, headers: request.headers };
    await runRepeated({
      runs,
      intervalMs: request.repeatIntervalMs,
      scheduler,
      signal: context.signal,
      runOnce: async (run) => {
        context.tally.startRun(run);
        await runPaced({
          count: request.count,
          intervalMs,
          scheduler,
          signal: context.signal,
          step: async (index) => {
            const sequence = (run - 1) * request.count + index + 1;
            const message = resolveMessageTemplate(template, variables, sequence, sources);
            await this.sendOne(context, sequence, {
              topic: request.topic,
              key: message.key,
              value: request.tombstone ? null : message.value,
              headers: message.headers,
              partition: request.partition ?? undefined,
              compression: request.compression,
              acks: request.acks,
            });
          },
        });
      },
    });
  }

  private async replayRecords(context: JobContext, records: ReplayRecord[], ratePerSecond: number): Promise<void> {
    await runPaced({
      count: records.length,
      intervalMs: messageIntervalMs(0, ratePerSecond),
      scheduler: this.options.scheduler ?? systemScheduler,
      signal: context.signal,
      step: async (index) => {
        const { sourceId: _sourceId, ...record } = records[index];
        await this.sendOne(context, index + 1, record);
      },
    });
  }

  private async sendOne(context: JobContext, index: number, record: KafkaProducedRecord): Promise<void> {
    try {
      const { partition, offset } = await context.producer.send(record);
      context.tally.record({ index, ok: true, partition, offset });
      context.failureStreak = 0;
    } catch (error) {
      const message = describeKafkaError(error);
      context.tally.record({ index, ok: false, error: message });
      context.failureStreak++;
      context.failureStreak >= MAX_CONSECUTIVE_FAILURES && context.abort(`Stopped after ${context.failureStreak} consecutive failures: ${message}`);
    }
    context.reportProgress();
  }
}
