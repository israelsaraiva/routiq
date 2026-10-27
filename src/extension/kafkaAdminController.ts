import { KafkaConnectionConfig } from '../core/kafka/connection';
import { KafkaAdminHostMessage, KafkaAdminRequestMessage } from '../shared/kafkaAdminTypes';
import { KafkaProfileDraft } from '../shared/types';
import { KafkaAdminService } from './kafkaAdmin';

export interface KafkaAdminControllerDependencies {
  service: KafkaAdminService;
  resolveConfig(profile: KafkaProfileDraft): Promise<KafkaConnectionConfig>;
  post(message: KafkaAdminHostMessage): void;
  refreshIntervalSeconds: number;
}

const MISSING_BROKER_ERROR = 'Please provide a broker endpoint in the connection form first.';

export class KafkaAdminController {
  constructor(private readonly dependencies: KafkaAdminControllerDependencies) {}

  postSettings(): void {
    this.dependencies.post({ type: 'adminSettings', refreshIntervalSeconds: this.dependencies.refreshIntervalSeconds });
  }

  async handle({ requestId, profile, command }: KafkaAdminRequestMessage): Promise<void> {
    const config = await this.dependencies.resolveConfig(profile);
    const result =
      config.brokers.length === 0
        ? { requestId, command: command.kind, error: MISSING_BROKER_ERROR }
        : await this.dependencies.service.handle(config, requestId, command);
    this.dependencies.post({ type: 'adminResult', result });
  }
}
