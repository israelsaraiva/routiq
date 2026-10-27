import { evaluateJsonPath } from '../core/jsonPath';
import { prettifyResponseBody, stripByteOrderMark } from '../core/responsePretty';

export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function statusClassName(status: number): string {
  if (status >= 200 && status < 300) {
    return 'status-ok';
  }
  if (status >= 300 && status < 400) {
    return 'status-redirect';
  }
  return status >= 500 || status === 0 ? 'status-error' : 'status-warn';
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function formatBodyView(body: string, pretty: boolean, filter: string, contentType = ''): { text: string; error?: string } {
  const trimmedFilter = filter.trim();
  if (trimmedFilter.length === 0) {
    return { text: pretty ? prettifyResponseBody(body, contentType) : body };
  }
  const document = parseJson(body);
  if (document === undefined) {
    return { text: body, error: 'Filter needs a JSON body' };
  }
  const result = evaluateJsonPath(trimmedFilter, document.value);
  if (!result.ok) {
    return { text: '', error: result.error };
  }
  return { text: JSON.stringify(result.value, null, pretty ? 2 : undefined) ?? '' };
}

function parseJson(body: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(stripByteOrderMark(body)) };
  } catch {
    return undefined;
  }
}
