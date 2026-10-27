export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  hostOnly: boolean;
  secure: boolean;
  expiresAt?: number;
}

export type CookieJar = Cookie[];

const DEFAULT_PATH = '/';

function splitAttribute(segment: string): [string, string] {
  const separator = segment.indexOf('=');
  return separator === -1
    ? [segment.trim().toLowerCase(), '']
    : [segment.slice(0, separator).trim().toLowerCase(), segment.slice(separator + 1).trim()];
}

export function defaultCookiePath(requestPath: string): string {
  if (!requestPath.startsWith('/') || requestPath.lastIndexOf('/') === 0) {
    return DEFAULT_PATH;
  }
  return requestPath.slice(0, requestPath.lastIndexOf('/'));
}

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/^\./, '').toLowerCase();
}

export function domainMatches(host: string, cookieDomain: string, hostOnly: boolean): boolean {
  const normalizedHost = host.toLowerCase();
  if (hostOnly) {
    return normalizedHost === cookieDomain;
  }
  return normalizedHost === cookieDomain || normalizedHost.endsWith(`.${cookieDomain}`);
}

export function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) {
    return true;
  }
  if (!requestPath.startsWith(cookiePath)) {
    return false;
  }
  return cookiePath.endsWith('/') || requestPath.charAt(cookiePath.length) === '/';
}

function expiryFrom(attributes: Map<string, string>, now: number): number | undefined {
  const maxAge = attributes.get('max-age');
  if (maxAge !== undefined && /^-?\d+$/.test(maxAge)) {
    return now + Number(maxAge) * 1000;
  }
  const expires = attributes.get('expires');
  const parsed = expires ? Date.parse(expires) : NaN;
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseSetCookie(header: string, requestUrl: string, now: number): Cookie | undefined {
  const [pair, ...rawAttributes] = header.split(';');
  const separator = pair.indexOf('=');
  const name = separator === -1 ? '' : pair.slice(0, separator).trim();
  if (name === '') {
    return undefined;
  }
  const url = new URL(requestUrl);
  const attributes = new Map(rawAttributes.map(splitAttribute));
  const domainAttribute = normalizeDomain(attributes.get('domain') ?? '');
  if (domainAttribute !== '' && !domainMatches(url.hostname, domainAttribute, false)) {
    return undefined;
  }
  const pathAttribute = attributes.get('path');
  return {
    name,
    value: pair.slice(separator + 1).trim(),
    domain: domainAttribute === '' ? url.hostname.toLowerCase() : domainAttribute,
    path: pathAttribute?.startsWith('/') ? pathAttribute : defaultCookiePath(url.pathname),
    hostOnly: domainAttribute === '',
    secure: attributes.has('secure'),
    expiresAt: expiryFrom(attributes, now),
  };
}

export function isExpired(cookie: Cookie, now: number): boolean {
  return cookie.expiresAt !== undefined && cookie.expiresAt <= now;
}

function sameIdentity(a: Cookie, b: Cookie): boolean {
  return a.name === b.name && a.domain === b.domain && a.path === b.path;
}

export function storeCookie(jar: CookieJar, cookie: Cookie, now: number): CookieJar {
  const remaining = jar.filter((existing) => !sameIdentity(existing, cookie) && !isExpired(existing, now));
  return isExpired(cookie, now) ? remaining : [...remaining, cookie];
}

export function storeResponseCookies(jar: CookieJar, setCookieHeaders: string[], requestUrl: string, now: number): CookieJar {
  return setCookieHeaders.reduce((current, header) => {
    const cookie = parseSetCookie(header, requestUrl, now);
    return cookie ? storeCookie(current, cookie, now) : current;
  }, jar);
}

export function cookiesForUrl(jar: CookieJar, requestUrl: string, now: number): Cookie[] {
  const url = new URL(requestUrl);
  const isSecure = url.protocol === 'https:';
  return jar
    .filter((cookie) => !isExpired(cookie, now))
    .filter((cookie) => domainMatches(url.hostname, cookie.domain, cookie.hostOnly))
    .filter((cookie) => pathMatches(url.pathname, cookie.path))
    .filter((cookie) => isSecure || !cookie.secure)
    .sort((a, b) => b.path.length - a.path.length);
}

export function buildCookieHeader(cookies: Cookie[]): string | undefined {
  return cookies.length === 0 ? undefined : cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export function mergeCookieHeader(existing: string | undefined, jarHeader: string | undefined): string | undefined {
  return [existing, jarHeader].filter((part): part is string => Boolean(part)).join('; ') || undefined;
}

export function pruneExpired(jar: CookieJar, now: number): CookieJar {
  return jar.filter((cookie) => !isExpired(cookie, now));
}

export function removeCookie(jar: CookieJar, target: Cookie): CookieJar {
  return jar.filter((cookie) => !sameIdentity(cookie, target));
}
