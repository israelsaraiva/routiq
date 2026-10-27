import * as vscode from 'vscode';
import { KafkaMessage } from '../shared/types';

const MESSAGES_PREFIX = 'routiq.kafka.messages.';
const LOG_FILE_KEY = 'routiq.kafka.logFilePath';

export class KafkaMessageHistory {
  constructor(private readonly memento: vscode.Memento) {}

  messages(profileId: string): KafkaMessage[] {
    return this.memento.get<KafkaMessage[]>(`${MESSAGES_PREFIX}${profileId}`) ?? [];
  }

  async saveMessages(profileId: string, messages: KafkaMessage[], limit: number): Promise<void> {
    await this.memento.update(`${MESSAGES_PREFIX}${profileId}`, limit > 0 && messages.length > 0 ? messages.slice(0, limit) : undefined);
  }

  get logFilePath(): string | undefined {
    return this.memento.get<string>(LOG_FILE_KEY);
  }

  async rememberLogFile(path: string | undefined): Promise<void> {
    await this.memento.update(LOG_FILE_KEY, path);
  }
}
