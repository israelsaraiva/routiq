import { KafkaMessage } from '../../shared/types';
import { FLOW_ID_ALT_PATTERN, FLOW_ID_PATTERN, extractFlowIdFromObject } from './flowId';
import { JsonLogEntry } from './jsonLogParser';

export const UNKNOWN_LEVEL = 'unknown';
export const SPLUNK_TOPIC = 'splunk-json';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null ? (value as JsonObject) : {};
}

function parseJsonObject(value: unknown): JsonObject | null {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? (parsed as JsonObject) : null;
  } catch {
    return null;
  }
}

function readStructuredMessageText(result: JsonObject, structured: JsonObject): string | undefined {
  const message = structured.message ?? result['structured.message'];
  return typeof message === 'string' ? message : undefined;
}

function bodyFromEnvelope(envelope: JsonObject): JsonObject | null {
  const nested = parseJsonObject(asObject(envelope.structured).message);
  return nested ?? (envelope.resource ? envelope : null);
}

export function resolveEventBody(result: JsonObject, structured: JsonObject, rawValue: string): JsonObject {
  const fromStructuredMessage = parseJsonObject(readStructuredMessageText(result, structured));
  if (fromStructuredMessage) {
    return fromStructuredMessage;
  }
  const envelope = parseJsonObject(rawValue);
  return (envelope && bodyFromEnvelope(envelope)) || {};
}

function flowIdFromBody(body: JsonObject, structured: JsonObject): string | null {
  const resource = asObject(body.resource);
  const direct = resource.flowId || body.flowId || structured.flowId;
  return direct ? String(direct) : extractFlowIdFromObject(structured);
}

export function extractFlowId(body: JsonObject, structured: JsonObject, structuredMessageText?: string): string {
  const fromObjects = flowIdFromBody(body, structured);
  if (fromObjects) {
    return fromObjects;
  }
  const match = structuredMessageText?.match(FLOW_ID_PATTERN) ?? structuredMessageText?.match(FLOW_ID_ALT_PATTERN);
  return match ? match[1] : UNKNOWN_LEVEL;
}

export function extractEventInfo(body: JsonObject): { eventType?: string; flowName?: string } {
  return { eventType: body.type ? String(body.type) : undefined, flowName: body.flow ? String(body.flow) : undefined };
}

export function extractCommandName(body: JsonObject): string | undefined {
  const resource = asObject(body.resource);
  const identifier = resource.commandId ? String(resource.commandId) : resource.type ? String(resource.type) : undefined;
  return identifier?.includes(':') ? identifier.split(':')[0] : identifier;
}

export function extractLevel(result: JsonObject, structured: JsonObject): string | undefined {
  const level = result['structured.level'] || structured.level || result.level;
  return level ? String(level).trim() : undefined;
}

export function isUnknownLevel(level: string | undefined): boolean {
  return level ? level.toLowerCase() === UNKNOWN_LEVEL : false;
}

export function extractMessage(result: JsonObject, structured: JsonObject): string | undefined {
  const message = result['structured.message'] || structured.message || result.message;
  return message ? String(message) : undefined;
}

function formatJsonValue(rawValue: string): string {
  try {
    return JSON.stringify(JSON.parse(rawValue), null, 2);
  } catch {
    return rawValue;
  }
}

function readTimestamp(result: JsonObject, structured: JsonObject): number {
  const value = result._time || result['@timestamp'] || structured['@timestamp'];
  const parsed = value ? new Date(value as string).getTime() : Date.now();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

export function convertEntryToMessage(entry: JsonLogEntry, index: number): KafkaMessage | null {
  const result = asObject(entry.result);
  const structured = asObject(result.structured);
  const raw = result._raw;
  const rawValue = typeof raw === 'string' ? raw : JSON.stringify(result);
  const level = extractLevel(result, structured);
  if (isUnknownLevel(level)) {
    return null;
  }
  const body = resolveEventBody(result, structured, rawValue);
  const flowId = extractFlowId(body, structured, readStructuredMessageText(result, structured));
  const container = result['kubernetes.container_name'];
  return {
    id: `json-${index}`,
    flowId: `${flowId}-${index}`,
    timestamp: readTimestamp(result, structured),
    topic: SPLUNK_TOPIC,
    partition: 0,
    offset: String(index),
    key: extractCommandName(body) ?? null,
    value: Object.keys(body).length > 0 ? JSON.stringify(body, null, 2) : formatJsonValue(rawValue),
    flowIdSource: 'splunk',
    containerName: container ? String(container) : undefined,
    level,
    rawMessage: typeof raw === 'string' ? raw : undefined,
    structuredMessage: extractMessage(result, structured),
    ...extractEventInfo(body),
  };
}

export function convertToKafkaMessages(entries: JsonLogEntry[]): KafkaMessage[] {
  return entries.map(convertEntryToMessage).filter((message): message is KafkaMessage => message !== null);
}
