import * as vscode from 'vscode';
import { KafkaUiState } from '../shared/kafkaMessageTypes';
import { KafkaProfileDraft } from '../shared/types';
import { mergeUiState, normalizeUiState } from '../core/kafka/uiState';
import { SchemaRegistryConfig } from './schemaRegistry';

const UI_STATE_KEY = 'routiq.kafka.messageUi';

export function schemaRegistryPasswordKey(profileId: string): string {
  return `routiq.kafka.${profileId}.schemaRegistryPassword`;
}

function settingsRegistryUrl(): string {
  return vscode.workspace.getConfiguration('routiq').get<string>('kafka.schemaRegistryUrl', '').trim();
}

export class KafkaMessageSettingsStore {
  constructor(
    private readonly memento: vscode.Memento,
    private readonly secrets: vscode.SecretStorage,
  ) {}

  readUi(): KafkaUiState {
    return normalizeUiState(this.memento.get<unknown>(UI_STATE_KEY));
  }

  async updateUi(patch: Partial<KafkaUiState>): Promise<void> {
    await this.memento.update(UI_STATE_KEY, mergeUiState(this.readUi(), patch));
  }

  async saveRegistryPassword(draft: KafkaProfileDraft): Promise<void> {
    if (draft.schemaRegistryPassword === undefined) {
      return;
    }
    const key = schemaRegistryPasswordKey(draft.id);
    await (draft.schemaRegistryPassword === '' ? this.secrets.delete(key) : this.secrets.store(key, draft.schemaRegistryPassword));
  }

  async removeRegistryPassword(profileId: string): Promise<void> {
    await this.secrets.delete(schemaRegistryPasswordKey(profileId));
  }

  async resolveRegistry(profile: KafkaProfileDraft | undefined): Promise<SchemaRegistryConfig | undefined> {
    const url = profile?.schemaRegistryUrl?.trim() || settingsRegistryUrl();
    if (!url) {
      return undefined;
    }
    const stored = profile ? await this.secrets.get(schemaRegistryPasswordKey(profile.id)) : undefined;
    return { url, username: profile?.schemaRegistryUsername || undefined, password: profile?.schemaRegistryPassword ?? stored };
  }
}
