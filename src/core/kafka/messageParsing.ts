import { KafkaMessage } from '../../shared/types';

export interface ParsedMessageData {
  commandName?: string;
  sourceMicroservice?: string;
  success?: boolean;
  errorMessage?: string;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null ? (value as JsonObject) : {};
}

function parseCommandName(resource: JsonObject): string {
  const commandId = String(resource.commandId || resource.type || '');
  return commandId.includes(':') ? commandId.split(':')[0] : commandId;
}

function parseErrorMessage(resource: JsonObject): string | undefined {
  const payload = asObject(resource.payload);
  const message = payload.errorMessage || payload.error;
  return message ? String(message) : undefined;
}

function parseSource(parsed: JsonObject, resource: JsonObject): string | undefined {
  const source = parsed.sourceMicroservice || resource.sourceMicroservice || parsed.host || resource.host;
  return source ? String(source) : undefined;
}

export function parseMessage(value: string): ParsedMessageData {
  try {
    const parsed = asObject(JSON.parse(value));
    const resource = asObject(parsed.resource);
    return {
      commandName: parseCommandName(resource) || undefined,
      sourceMicroservice: parseSource(parsed, resource),
      success: typeof resource.success === 'boolean' ? resource.success : undefined,
      errorMessage: parseErrorMessage(resource),
    };
  } catch {
    return {};
  }
}

export function formatMessageContent(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 4);
  } catch {
    return value;
  }
}

export function parseJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function buildMessageExport(message: KafkaMessage): Record<string, unknown> {
  return {
    id: message.id,
    flowId: message.flowId,
    flowIdSource: message.flowIdSource,
    timestamp: new Date(message.timestamp).toISOString(),
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    key: message.key,
    headers: message.headers,
    value: parseJsonOrText(message.value),
    containerName: message.containerName,
    level: message.level,
    rawMessage: message.rawMessage === undefined ? undefined : parseJsonOrText(message.rawMessage),
    structuredMessage: message.structuredMessage,
    eventType: message.eventType,
    flowName: message.flowName,
  };
}

export function buildMessagesExport(messages: KafkaMessage[]): string {
  return JSON.stringify(messages.map(buildMessageExport), null, 2);
}

export function serializeHeaders(headers: Record<string, string> | undefined): string {
  return headers && Object.keys(headers).length > 0 ? JSON.stringify(headers, null, 2) : '';
}
