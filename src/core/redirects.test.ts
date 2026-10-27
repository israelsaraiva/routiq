import { describe, expect, it } from 'vitest';
import { resolveRedirect } from './redirects';

const base = { method: 'POST', headers: { 'Content-Type': 'text/plain', Authorization: 'Bearer t', 'X-A': '1' }, currentUrl: 'https://a.test/p/q', location: '/next' };

describe('resolveRedirect', () => {
  it('ignores non-redirect statuses and missing location', () => {
    expect(resolveRedirect({ ...base, status: 200 })).toBeUndefined();
    expect(resolveRedirect({ ...base, status: 302, location: '' })).toBeUndefined();
  });

  it('switches POST to GET without body on 301/302/303', () => {
    for (const status of [301, 302, 303]) {
      expect(resolveRedirect({ ...base, status })).toEqual({
        url: 'https://a.test/next',
        method: 'GET',
        keepsBody: false,
        headers: { Authorization: 'Bearer t', 'X-A': '1' },
      });
    }
  });

  it('keeps method and body on 307/308', () => {
    for (const status of [307, 308]) {
      expect(resolveRedirect({ ...base, status })).toMatchObject({ method: 'POST', keepsBody: true });
    }
  });

  it('keeps PUT on 302 but turns it into GET on 303', () => {
    expect(resolveRedirect({ ...base, method: 'PUT', status: 302 })?.method).toBe('PUT');
    expect(resolveRedirect({ ...base, method: 'PUT', status: 303 })?.method).toBe('GET');
    expect(resolveRedirect({ ...base, method: 'HEAD', status: 303 })?.method).toBe('HEAD');
  });

  it('strips credentials on cross-origin redirects', () => {
    const target = resolveRedirect({ ...base, status: 307, location: 'https://b.test/x' });
    expect(target?.headers).toEqual({ 'Content-Type': 'text/plain', 'X-A': '1' });
  });
});
