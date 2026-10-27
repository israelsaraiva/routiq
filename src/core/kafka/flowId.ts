import { KafkaFlowIdSource } from '../../shared/types';

export const FLOW_ID_PATTERN = /Flow ID:?\s*([a-f0-9-]{36})/i;
export const FLOW_ID_ALT_PATTERN = /flowId[=:]\s*([a-f0-9-]{36})/i;
export const UNKNOWN_FLOW_ID = 'unknown';

const FLOW_ID_FIELDS = ['flowId', 'flowid', 'flow-id', 'flow_id'];
const FLOW_ID_HEADERS = ['flowId', 'flowid', 'flow-id'];

type JsonObject = Record<string, unknown>;

export interface ResolvedFlowId {
  flowId: string;
  source: KafkaFlowIdSource;
}

export interface FlowIdCandidates {
  headers?: Record<string, string>;
  value?: string;
  key?: string | null;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function readFlowIdField(source: JsonObject): string | null {
  const field = FLOW_ID_FIELDS.find((name) => source[name]);
  return field ? String(source[field]) : null;
}

function readNestedFlowId(source: JsonObject): string | null {
  for (const [name, child] of Object.entries(source)) {
    const found = name !== 'resource' && isJsonObject(child) ? findFlowIdDeep(child) : null;
    if (found) {
      return found;
    }
  }
  return null;
}

export function findFlowIdDeep(source: unknown): string | null {
  if (!isJsonObject(source)) {
    return null;
  }
  const fromResource = isJsonObject(source.resource) ? readFlowIdField(source.resource) : null;
  return fromResource ?? readFlowIdField(source) ?? readNestedFlowId(source);
}

function parseJsonObject(text: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isJsonObject(parsed) ? (parsed as JsonObject) : null;
  } catch {
    return null;
  }
}

function matchFlowIdText(text: string): string | null {
  const match = text.match(FLOW_ID_PATTERN) ?? text.match(FLOW_ID_ALT_PATTERN);
  return match ? match[1] : null;
}

function flowIdFromJsonText(text: string): string | null {
  const parsed = parseJsonObject(text);
  if (!parsed) {
    return null;
  }
  const resource = isJsonObject(parsed.resource) ? parsed.resource : undefined;
  return resource?.flowId ? String(resource.flowId) : parsed.flowId ? String(parsed.flowId) : null;
}

export function extractFlowIdFromObject(source: JsonObject): string | null {
  if (source.flowId) {
    return String(source.flowId);
  }
  if (isJsonObject(source.resource) && source.resource.flowId) {
    return String(source.resource.flowId);
  }
  return typeof source.message === 'string' ? (matchFlowIdText(source.message) ?? flowIdFromJsonText(source.message)) : null;
}

function flowIdFromHeaders(headers: Record<string, string> | undefined): string | null {
  const name = FLOW_ID_HEADERS.find((candidate) => headers?.[candidate]);
  return name && headers ? headers[name] : null;
}

export function resolveFlowId({ headers, value, key }: FlowIdCandidates): ResolvedFlowId {
  const fromHeader = flowIdFromHeaders(headers);
  if (fromHeader) {
    return { flowId: fromHeader, source: 'header' };
  }
  const fromContent = value ? findFlowIdDeep(parseJsonObject(value)) : null;
  if (fromContent) {
    return { flowId: fromContent, source: 'json-content' };
  }
  return key ? { flowId: key, source: 'key' } : { flowId: UNKNOWN_FLOW_ID, source: 'none' };
}
