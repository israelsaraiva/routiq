import { RequestModel } from '../shared/types';
import { PreparedRequest, prepareRequest } from './requestBuilder';
import { requestKindOf, splitSubprotocols, toWebSocketUrl } from './requestKinds';
import { substituteVariables } from './variables';

const SSE_ACCEPT = 'text/event-stream';

export interface PreparedStream {
  url: string;
  headers: Record<string, string>;
  subprotocols: string[];
}

export function parseSubprotocols(text: string, values: Record<string, string>): string[] {
  return splitSubprotocols(substituteVariables(text, values));
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((existing) => existing.toLowerCase() === name);
}

function withSseAccept(headers: Record<string, string>): Record<string, string> {
  return hasHeader(headers, 'accept') ? headers : { ...headers, Accept: SSE_ACCEPT };
}

function stripBodyHeaders(prepared: PreparedRequest): Record<string, string> {
  return Object.fromEntries(Object.entries(prepared.headers).filter(([name]) => name.toLowerCase() !== 'content-length'));
}

export function prepareStream(request: RequestModel, values: Record<string, string>): PreparedStream {
  const prepared = prepareRequest(request, values);
  const kind = requestKindOf(request);
  const headers = stripBodyHeaders(prepared);
  if (kind === 'websocket') {
    return { url: toWebSocketUrl(prepared.url), headers, subprotocols: parseSubprotocols(request.subprotocols ?? '', values) };
  }
  return { url: prepared.url, headers: withSseAccept(headers), subprotocols: [] };
}

export function toCookieUrl(streamUrl: string): string {
  return streamUrl.replace(/^ws(s?):/i, 'http$1:');
}
