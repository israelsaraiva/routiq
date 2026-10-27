import * as vscode from 'vscode';
import { KafkaSendTemplate } from '../shared/kafkaProduceTypes';
import { normalizeStoredTemplates, removeTemplate, upsertTemplate } from '../core/kafka/sendTemplates';

const TEMPLATES_KEY = 'routiq.kafka.sendTemplates';

export class KafkaTemplateStore {
  constructor(private readonly memento: vscode.Memento) {}

  list(): KafkaSendTemplate[] {
    return normalizeStoredTemplates(this.memento.get<unknown>(TEMPLATES_KEY));
  }

  async save(template: KafkaSendTemplate): Promise<KafkaSendTemplate[]> {
    return this.write(upsertTemplate(this.list(), template));
  }

  async remove(templateId: string): Promise<KafkaSendTemplate[]> {
    return this.write(removeTemplate(this.list(), templateId));
  }

  private async write(templates: KafkaSendTemplate[]): Promise<KafkaSendTemplate[]> {
    await this.memento.update(TEMPLATES_KEY, templates);
    return templates;
  }
}
