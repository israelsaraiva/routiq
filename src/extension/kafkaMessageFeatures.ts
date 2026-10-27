import * as vscode from 'vscode';
import { buildRequestFromItem } from '../core/kafka/messageToRequest';
import { createRateLimiter } from '../core/kafka/rateLimiter';
import { fromBase64 } from '../core/kafka/wireFormat';
import { KafkaSaveAsRequestItem } from '../shared/kafkaMessageTypes';
import { KafkaHostMessage, KafkaWebviewMessage } from '../shared/types';
import { pickDestination } from './destinationPicker';
import { KafkaValueDecoder } from './kafkaDecoding';
import { KafkaMessageSettingsStore } from './kafkaMessageSettings';
import { Storage } from './storage';

const RULE_NOTIFICATION_INTERVAL_MS = 10_000;
const SAMPLE_LENGTH = 120;

export interface KafkaMessageFeaturesDependencies {
  post: (message: KafkaHostMessage) => void;
  settings: KafkaMessageSettingsStore;
  decoder: KafkaValueDecoder;
  storage: Storage;
}

export class KafkaMessageFeatures {
  private readonly allowNotification = createRateLimiter(RULE_NOTIFICATION_INTERVAL_MS);

  constructor(private readonly dependencies: KafkaMessageFeaturesDependencies) {}

  async handle(message: KafkaWebviewMessage): Promise<void> {
    switch (message.type) {
      case 'kafkaSaveUiState':
        return this.dependencies.settings.updateUi(message.ui);
      case 'kafkaDecode':
        return this.decode(message.messageId, message.base64);
      case 'kafkaRuleHit':
        return this.notifyRuleHit(message.ruleName, message.count, message.sample);
      case 'kafkaSaveAsRequest':
        return this.saveAsRequests(message.items);
    }
  }

  private async decode(messageId: string, base64: string): Promise<void> {
    const decoded = await this.dependencies.decoder.decodeBytes(fromBase64(base64));
    this.dependencies.post({ type: 'kafkaDecoded', messageId, decoded });
  }

  private notifyRuleHit(ruleName: string, count: number, sample: string): void {
    this.allowNotification(ruleName) &&
      void vscode.window.showInformationMessage(`Routiq Kafka: rule "${ruleName}" matched ${count} message(s) — ${sample.slice(0, SAMPLE_LENGTH)}`);
  }

  private async saveAsRequests(items: KafkaSaveAsRequestItem[]): Promise<void> {
    const { storage } = this.dependencies;
    const destination = items.length > 0 ? await pickDestination(storage) : undefined;
    if (!destination) {
      return;
    }
    const saved = items.filter((item) => storage.addRequestFrom(destination.collectionId, buildRequestFromItem(item), destination.folderId));
    void vscode.window.showInformationMessage(`Routiq: saved ${saved.length} request(s) from Kafka message(s)`);
  }
}
