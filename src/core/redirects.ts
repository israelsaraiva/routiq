export interface RedirectInput {
  status: number;
  method: string;
  headers: Record<string, string>;
  currentUrl: string;
  location: string;
}

export interface RedirectTarget {
  url: string;
  method: string;
  keepsBody: boolean;
  headers: Record<string, string>;
}

const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const BODY_HEADERS = ['content-type', 'content-length', 'content-encoding'];
const CROSS_ORIGIN_SENSITIVE_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];

export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.includes(status);
}

function dropsBody(status: number, method: string): boolean {
  if (status === 303) {
    return method !== 'HEAD';
  }
  return (status === 301 || status === 302) && method === 'POST';
}

function withoutHeaders(headers: Record<string, string>, names: string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !names.includes(name.toLowerCase())));
}

export function resolveRedirect(input: RedirectInput): RedirectTarget | undefined {
  if (!isRedirectStatus(input.status) || input.location.trim() === '') {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(input.location, input.currentUrl);
  } catch {
    return undefined;
  }
  const changesToGet = dropsBody(input.status, input.method);
  const crossOrigin = url.origin !== new URL(input.currentUrl).origin;
  let headers = changesToGet ? withoutHeaders(input.headers, BODY_HEADERS) : input.headers;
  headers = crossOrigin ? withoutHeaders(headers, CROSS_ORIGIN_SENSITIVE_HEADERS) : headers;
  return {
    url: url.toString(),
    method: changesToGet ? 'GET' : input.method,
    keepsBody: !changesToGet,
    headers,
  };
}
