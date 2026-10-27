import { KafkaSendTemplate } from '../../shared/kafkaProduceTypes';
import { SendDraft } from './sendJob';
import { parseHeadersJson } from './connection';
import { headersTextFromRows, headersToRows } from './headersTable';

function isStoredTemplate(value: unknown): value is KafkaSendTemplate {
  const candidate = value as Partial<KafkaSendTemplate> | null;
  return typeof candidate?.id === 'string' && typeof candidate.name === 'string' && typeof candidate.value === 'string';
}

const TEMPLATE_DEFAULTS: Omit<KafkaSendTemplate, 'id' | 'name' | 'value'> = { topic: '', key: '', headers: {}, partition: null, tombstone: false };

export function normalizeStoredTemplates(stored: unknown): KafkaSendTemplate[] {
  return Array.isArray(stored)
    ? stored.filter(isStoredTemplate).map((template) => ({ ...TEMPLATE_DEFAULTS, ...template }))
    : [];
}

export function upsertTemplate(templates: KafkaSendTemplate[], template: KafkaSendTemplate): KafkaSendTemplate[] {
  const sameName = (candidate: KafkaSendTemplate) => candidate.name.trim().toLowerCase() === template.name.trim().toLowerCase();
  const existing = templates.find((candidate) => candidate.id === template.id) ?? templates.find(sameName);
  const saved = { ...template, id: existing?.id ?? template.id, name: template.name.trim() };
  return existing ? templates.map((candidate) => (candidate === existing ? saved : candidate)) : [...templates, saved];
}

export function removeTemplate(templates: KafkaSendTemplate[], templateId: string): KafkaSendTemplate[] {
  return templates.filter((template) => template.id !== templateId);
}

export function templateFromDraft(id: string, name: string, draft: SendDraft): KafkaSendTemplate {
  const partition = draft.partition.trim() === '' ? null : Number(draft.partition);
  return {
    id,
    name,
    topic: draft.topic,
    key: draft.key,
    headers: parseHeadersJson(draft.headers).headers,
    value: draft.value,
    partition: Number.isInteger(partition) ? partition : null,
    tombstone: draft.tombstone,
  };
}

export function applyTemplate(draft: SendDraft, template: KafkaSendTemplate): SendDraft {
  return {
    ...draft,
    topic: template.topic,
    key: template.key,
    headers: headersTextFromRows(headersToRows(template.headers)),
    value: template.value,
    partition: template.partition === null ? '' : String(template.partition),
    tombstone: template.tombstone,
  };
}
