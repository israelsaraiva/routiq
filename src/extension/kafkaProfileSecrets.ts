import * as vscode from 'vscode';
import { KafkaSecretName, KafkaSecretValues } from '../shared/kafkaEngineTypes';
import { KAFKA_SECRET_NAMES, kafkaSecretKey } from '../core/kafka/secretNames';

export class KafkaProfileSecrets {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async read(profileId: string): Promise<KafkaSecretValues> {
    const entries = await Promise.all(KAFKA_SECRET_NAMES.map(async (name) => [name, await this.secrets.get(kafkaSecretKey(profileId, name))] as const));
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
  }

  async storedNames(profileId: string): Promise<KafkaSecretName[]> {
    return Object.keys(await this.read(profileId)) as KafkaSecretName[];
  }

  async write(profileId: string, values: KafkaSecretValues | undefined): Promise<void> {
    await Promise.all(
      Object.entries(values ?? {}).map(([name, value]) => {
        const key = kafkaSecretKey(profileId, name as KafkaSecretName);
        return value === '' ? this.secrets.delete(key) : this.secrets.store(key, value);
      }),
    );
  }

  async copy(sourceProfileId: string, targetProfileId: string): Promise<void> {
    await this.write(targetProfileId, await this.read(sourceProfileId));
  }

  async removeAll(profileId: string): Promise<void> {
    await Promise.all(KAFKA_SECRET_NAMES.map((name) => this.secrets.delete(kafkaSecretKey(profileId, name))));
  }
}
