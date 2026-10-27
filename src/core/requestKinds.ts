import { RequestKind, RequestModel } from '../shared/types';

const KIND_LABELS: Record<RequestKind, string> = { http: 'HTTP', sse: 'SSE', websocket: 'WS', grpc: 'gRPC', graphql: 'GQL' };

export function requestKindOf(request: Pick<RequestModel, 'kind'> & Partial<Pick<RequestModel, 'method' | 'body'>>): RequestKind {
  return request.kind ?? (isLegacyGraphqlRequest(request) ? 'graphql' : 'http');
}

function isLegacyGraphqlRequest(request: Partial<Pick<RequestModel, 'method' | 'body'>>): boolean {
  return request.method === 'POST' && request.body?.type === 'graphql';
}

export function kindLabel(kind: RequestKind): string {
  return KIND_LABELS[kind];
}

export function isStreamingRequest(request: Pick<RequestModel, 'kind' | 'stream'>): boolean {
  const kind = requestKindOf(request);
  return kind === 'sse' || kind === 'websocket' || kind === 'grpc' || (kind === 'http' && request.stream === true);
}

export function usesEventLog(request: Pick<RequestModel, 'kind' | 'stream'>): boolean {
  const kind = requestKindOf(request);
  return kind === 'sse' || (kind === 'http' && request.stream === true);
}

export function describeRequest(request: Pick<RequestModel, 'kind' | 'method'> & Partial<Pick<RequestModel, 'body'>>): string {
  const kind = requestKindOf(request);
  return kind === 'http' ? request.method : kindLabel(kind);
}

export function splitSubprotocols(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .filter((protocol) => protocol !== '');
}

export function toWebSocketUrl(url: string): string {
  return url.replace(/^http(s?):\/\//i, (_match, secure: string) => `ws${secure}://`);
}
