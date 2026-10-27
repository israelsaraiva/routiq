import { totalLag } from '../core/kafka/lag';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import { KafkaAdminFactory, KafkaAdminLike } from './kafkaAdmin';

const LAG_CLIENT_ID = 'routiq-lag';

export interface LagTarget {
  config: KafkaConnectionConfig;
  groupId: string;
  topics: string[];
}

export interface KafkaLagMonitorOptions {
  intervalMs: number;
  timeoutMs: number;
  createAdmin: KafkaAdminFactory;
  onLag: (lag: number | undefined) => void;
}

export class KafkaLagMonitor {
  private timer: NodeJS.Timeout | undefined;
  private admin: KafkaAdminLike | undefined;
  private generation = 0;
  private polling = false;

  constructor(private readonly options: KafkaLagMonitorOptions) {}

  start(target: LagTarget): void {
    this.stop();
    const generation = this.generation;
    void this.poll(target, generation);
    this.timer = setInterval(() => void this.poll(target, generation), this.options.intervalMs);
  }

  stop(): void {
    this.generation++;
    clearInterval(this.timer);
    this.timer = undefined;
    this.polling = false;
    this.dropAdmin();
  }

  private async poll(target: LagTarget, generation: number): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;
    const lag = await this.readLag(target).catch(() => undefined);
    if (generation !== this.generation) {
      return;
    }
    this.polling = false;
    this.options.onLag(lag);
    lag === undefined && this.dropAdmin();
  }

  private dropAdmin(): void {
    const admin = this.admin;
    this.admin = undefined;
    void admin?.disconnect().catch(() => undefined);
  }

  private async connectedAdmin(config: KafkaConnectionConfig): Promise<KafkaAdminLike> {
    if (!this.admin) {
      const admin = this.options.createAdmin(config, LAG_CLIENT_ID, this.options.timeoutMs);
      await admin.connect();
      this.admin = admin;
    }
    return this.admin;
  }

  private async readLag({ config, groupId, topics }: LagTarget): Promise<number | undefined> {
    if (topics.length === 0) {
      return undefined;
    }
    const admin = await this.connectedAdmin(config);
    const committed = await admin.fetchGroupOffsets(groupId, topics);
    const entries = await Promise.all(topics.map(async (topic) => [topic, await admin.fetchTopicOffsets(topic)] as const));
    return totalLag(committed, new Map(entries));
  }
}
