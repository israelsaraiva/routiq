import * as vscode from 'vscode';
import { KafkaExportFormat } from '../shared/kafkaProduceTypes';
import { EXPORT_FORMAT_EXTENSIONS } from '../core/kafka/messageExport';
import { KafkaHostMessage, KafkaProfileDraft } from '../shared/types';
import { ConfirmPrompt, ProduceEnvironment, ResolvedConnection } from './kafkaProduceController';
import { KafkaProfileStore } from './kafkaProfileStore';
import { KafkaTemplateStore } from './kafkaTemplateStore';

const FORMAT_LABELS: Record<KafkaExportFormat, string> = { json: 'JSON', ndjson: 'NDJSON', csv: 'CSV' };

export interface ProduceEnvironmentSources {
  profiles: KafkaProfileStore;
  templates: KafkaTemplateStore;
  post(message: KafkaHostMessage): void;
  resolveConnection(draft: KafkaProfileDraft): Promise<ResolvedConnection>;
}

async function confirm({ message, detail, action }: ConfirmPrompt): Promise<boolean> {
  return (await vscode.window.showWarningMessage(message, { modal: true, detail }, action)) === action;
}

async function saveExport(format: KafkaExportFormat, suggestedName: string, content: string): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(suggestedName),
    filters: { [FORMAT_LABELS[format]]: [EXPORT_FORMAT_EXTENSIONS[format]] },
  });
  if (target) {
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
    void vscode.window.showInformationMessage(`Routiq: exported ${target.fsPath}`);
  }
}

export function createProduceEnvironment({ profiles, templates, post, resolveConnection }: ProduceEnvironmentSources): ProduceEnvironment {
  return {
    resolveConnection,
    storedProfile: (profileId) => profiles.get(profileId),
    post,
    confirm,
    saveExport,
    templates: {
      list: () => templates.list(),
      save: (template) => templates.save(template),
      remove: (templateId) => templates.remove(templateId),
    },
  };
}
