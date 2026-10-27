const SENSITIVE_PARAMETER = /token|key|secret|pass|auth|sig|credential|session|code|jwt|bearer/i;
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi;
const AUTH_SCHEME_VALUE = /\b(Bearer|Basic|Digest)\s+[^\s,;'"]+/gi;
const REDACTED = '***';

export function redactText(text: string): string {
  return text.replace(URL_CREDENTIALS, `$1${REDACTED}@`).replace(AUTH_SCHEME_VALUE, `$1 ${REDACTED}`);
}

export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    for (const name of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_PARAMETER.test(name)) {
        parsed.searchParams.set(name, REDACTED);
      }
    }
    return parsed.toString();
  } catch {
    return redactText(url);
  }
}

export function redactProxyUrl(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return redactText(proxyUrl);
  }
}
