import { KeyValue, RequestBody, RequestModel } from '../shared/types';
import { parseGraphqlPayload } from './curl';
import { isStreamingRequest, requestKindOf } from './requestKinds';

export type ConversionTarget = 'graphql' | 'http';

export interface ConversionOutcome {
  request: RequestModel;
  warnings: string[];
}

const GRAPHQL_DOCUMENT_START = /^\s*(query|mutation|subscription|fragment)\b/;
const JSON_CONTENT_TYPE = 'application/json';

export function conversionTargetOf(request: RequestModel): ConversionTarget | undefined {
  const kind = requestKindOf(request);
  if (kind === 'graphql') {
    return 'http';
  }
  return kind === 'http' && !isStreamingRequest(request) ? 'graphql' : undefined;
}

export function convertToGraphql(request: RequestModel): ConversionOutcome {
  const { body, warnings } = graphqlBodyFrom(request.body);
  const converted: RequestModel = {
    ...request,
    kind: 'graphql',
    method: 'POST',
    body,
    headers: withoutPlainJsonContentType(request.headers),
  };
  return { request: converted, warnings };
}

export function convertToHttp(request: RequestModel): ConversionOutcome {
  const { text, warnings } = jsonTextFrom(request.body);
  const converted: RequestModel = {
    ...request,
    method: 'POST',
    body: { type: 'json', text, form: [] },
    headers: withJsonContentType(request.headers),
  };
  delete converted.kind;
  return { request: converted, warnings };
}

interface GraphqlBodyOutcome {
  body: RequestBody;
  warnings: string[];
}

function emptyGraphqlBody(): RequestBody {
  return { type: 'graphql', text: '', form: [] };
}

function graphqlBodyFrom(body: RequestBody): GraphqlBodyOutcome {
  switch (body.type) {
    case 'graphql':
      return { body, warnings: [] };
    case 'none':
      return { body: emptyGraphqlBody(), warnings: [] };
    case 'json':
      return graphqlBodyFromJson(body.text);
    case 'text':
    case 'xml':
      return graphqlBodyFromText(body.text);
    default:
      return { body: emptyGraphqlBody(), warnings: [`The ${body.type} body cannot be used in a GraphQL request and was discarded.`] };
  }
}

function graphqlBodyFromJson(text: string): GraphqlBodyOutcome {
  if (text.trim() === '') {
    return { body: emptyGraphqlBody(), warnings: [] };
  }
  const normalized = normalizedGraphqlJson(text);
  const parsed = normalized && parseGraphqlPayload(normalized.json);
  if (!normalized || !parsed) {
    return {
      body: emptyGraphqlBody(),
      warnings: ['The JSON body is not a GraphQL payload ({ "query": "…" }) and was discarded. Paste your query in the Query tab.'],
    };
  }
  return { body: parsed, warnings: normalized.warnings };
}

interface NormalizedJson {
  json: string;
  warnings: string[];
}

function normalizedGraphqlJson(text: string): NormalizedJson | undefined {
  const payload = parseJsonRecord(text);
  if (!payload || typeof payload.query !== 'string') {
    return undefined;
  }
  const warnings: string[] = [];
  const { query, variables, operationName, ...rest } = payload;
  if (Object.keys(rest).length > 0) {
    warnings.push(`Unsupported GraphQL fields were discarded: ${Object.keys(rest).join(', ')}.`);
  }
  const carriedVariables = variablesObjectFrom(variables);
  if (carriedVariables === undefined && isNonEmptyString(variables)) {
    warnings.push('The variables string is not a JSON object and was discarded.');
  }
  return { json: JSON.stringify({ query, variables: carriedVariables, operationName }), warnings };
}

function variablesObjectFrom(variables: unknown): unknown {
  return typeof variables === 'string' ? parseJsonRecord(variables) : variables;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function graphqlBodyFromText(text: string): GraphqlBodyOutcome {
  if (text.trim() === '') {
    return { body: emptyGraphqlBody(), warnings: [] };
  }
  if (GRAPHQL_DOCUMENT_START.test(text) || text.trimStart().startsWith('{')) {
    return { body: { type: 'graphql', text, form: [] }, warnings: [] };
  }
  return { body: emptyGraphqlBody(), warnings: ['The text body does not look like a GraphQL document and was discarded.'] };
}

function jsonTextFrom(body: RequestBody): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const payload: Record<string, unknown> = { query: body.text };
  const variables = body.graphqlVariables?.trim() ?? '';
  if (variables !== '') {
    const parsed = parseJsonValue(variables);
    if (parsed === undefined) {
      warnings.push('The GraphQL variables are not valid JSON and were discarded.');
    } else {
      payload.variables = parsed;
    }
  }
  const operationName = body.graphqlOperationName?.trim() ?? '';
  if (operationName !== '') {
    payload.operationName = operationName;
  }
  return { text: JSON.stringify(payload, null, 2), warnings };
}

function parseJsonValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isContentType(header: KeyValue): boolean {
  return header.key.toLowerCase() === 'content-type';
}

function withoutPlainJsonContentType(headers: KeyValue[]): KeyValue[] {
  return headers.filter((header) => !(isContentType(header) && header.value.trim().toLowerCase() === JSON_CONTENT_TYPE));
}

function withJsonContentType(headers: KeyValue[]): KeyValue[] {
  const withoutContentType = headers.filter((header) => !isContentType(header));
  return [...withoutContentType, { key: 'Content-Type', value: JSON_CONTENT_TYPE, enabled: true }];
}
