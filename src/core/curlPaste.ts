import { KeyValue, RequestModel } from '../shared/types';
import { CurlImportResult, parseCurlCommand } from './curl';
import { detectImportFormat } from './importDetection';

export interface CurlPasteOutcome {
  request: RequestModel;
  warnings: string[];
}

export function extractPastedCurlCommand(clipboardText: string): string | undefined {
  const detection = detectImportFormat(clipboardText);
  return detection.kind === 'curl' ? detection.command : undefined;
}

function decodeComponent(text: string): string {
  const spaced = text.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

function toParam(pair: string): KeyValue {
  const separator = pair.indexOf('=');
  const rawKey = separator === -1 ? pair : pair.slice(0, separator);
  const rawValue = separator === -1 ? '' : pair.slice(separator + 1);
  return { key: decodeComponent(rawKey), value: decodeComponent(rawValue), enabled: true };
}

export function splitUrlQuery(url: string): { baseUrl: string; params: KeyValue[] } {
  const fragmentStart = url.indexOf('#');
  const fragment = fragmentStart === -1 ? '' : url.slice(fragmentStart);
  const withoutFragment = fragmentStart === -1 ? url : url.slice(0, fragmentStart);
  const queryStart = withoutFragment.indexOf('?');
  if (queryStart === -1) {
    return { baseUrl: url, params: [] };
  }
  const pairs = withoutFragment.slice(queryStart + 1).split('&').filter((pair) => pair !== '');
  return { baseUrl: `${withoutFragment.slice(0, queryStart)}${fragment}`, params: pairs.map(toParam) };
}

export function applyCurlToRequest(request: RequestModel, parsed: CurlImportResult): RequestModel {
  const { baseUrl, params } = splitUrlQuery(parsed.request.url);
  const applied: RequestModel = {
    ...request,
    method: parsed.request.method,
    url: baseUrl,
    params,
    headers: parsed.request.headers,
    body: parsed.request.body,
    auth: parsed.request.auth,
  };
  if (parsed.request.kind) {
    applied.kind = parsed.request.kind;
  } else {
    delete applied.kind;
  }
  return applied;
}

export function importPastedCurl(request: RequestModel, command: string): CurlPasteOutcome {
  const parsed = parseCurlCommand(command);
  return { request: applyCurlToRequest(request, parsed), warnings: parsed.warnings };
}
