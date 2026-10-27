import { describe, expect, it } from 'vitest';
import { buildCookieHeader, cookiesForUrl, parseSetCookie, storeResponseCookies } from './cookies';

const NOW = Date.parse('2024-01-01T00:00:00Z');
const URL_A = 'https://api.example.com/v1/users';

describe('parseSetCookie', () => {
  it('defaults to host-only cookie with directory path', () => {
    expect(parseSetCookie('sid=abc', URL_A, NOW)).toMatchObject({ name: 'sid', value: 'abc', domain: 'api.example.com', path: '/v1', hostOnly: true, secure: false });
  });

  it('reads domain, path, secure and max-age', () => {
    const cookie = parseSetCookie('a=1; Domain=.Example.com; Path=/x; Secure; Max-Age=60', URL_A, NOW);
    expect(cookie).toMatchObject({ domain: 'example.com', path: '/x', hostOnly: false, secure: true, expiresAt: NOW + 60000 });
  });

  it('rejects a domain the host does not belong to', () => {
    expect(parseSetCookie('a=1; Domain=other.com', URL_A, NOW)).toBeUndefined();
  });

  it('parses Expires dates', () => {
    expect(parseSetCookie('a=1; Expires=Mon, 01 Jan 2029 00:00:00 GMT', URL_A, NOW)?.expiresAt).toBe(Date.parse('2029-01-01T00:00:00Z'));
  });
});

describe('cookie jar', () => {
  it('replaces cookies with the same identity and removes expired ones', () => {
    let jar = storeResponseCookies([], ['a=1; Path=/'], URL_A, NOW);
    jar = storeResponseCookies(jar, ['a=2; Path=/', 'b=1; Path=/'], URL_A, NOW);
    expect(jar.map((cookie) => cookie.value)).toEqual(['2', '1']);
    jar = storeResponseCookies(jar, ['a=; Path=/; Max-Age=0'], URL_A, NOW);
    expect(jar.map((cookie) => cookie.name)).toEqual(['b']);
  });

  it('matches by domain, path and secure flag', () => {
    const jar = storeResponseCookies(
      [],
      ['host=1; Path=/v1', 'dom=1; Domain=example.com; Path=/', 'sec=1; Path=/; Secure', 'deep=1; Path=/v1/users/x'],
      URL_A,
      NOW,
    );
    const names = (url: string) => cookiesForUrl(jar, url, NOW).map((cookie) => cookie.name).sort();
    expect(names('https://api.example.com/v1/users')).toEqual(['dom', 'host', 'sec']);
    expect(names('http://api.example.com/v1/users')).toEqual(['dom', 'host']);
    expect(names('https://www.example.com/v1')).toEqual(['dom']);
    expect(names('https://api.example.com/v10')).toEqual(['dom', 'sec']);
  });

  it('ignores expired cookies and builds a header', () => {
    const jar = storeResponseCookies([], ['a=1; Path=/', 'b=2; Path=/'], URL_A, NOW);
    expect(buildCookieHeader(cookiesForUrl(jar, URL_A, NOW))).toBe('a=1; b=2');
    expect(cookiesForUrl(jar, URL_A, NOW + 1)).toHaveLength(2);
    const expiring = storeResponseCookies([], ['a=1; Max-Age=5'], URL_A, NOW);
    expect(cookiesForUrl(expiring, URL_A, NOW + 6000)).toEqual([]);
  });
});
