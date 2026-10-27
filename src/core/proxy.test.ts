import { describe, expect, it } from 'vitest';
import { resolveProxyUrl } from './proxy';

const none = { routiqProxy: '', vscodeProxy: '', env: {} };

describe('resolveProxyUrl', () => {
  it('prefers the routiq setting, then VS Code, then environment', () => {
    expect(resolveProxyUrl('https://a.test', { ...none, routiqProxy: 'p1:8080', vscodeProxy: 'http://p2' })).toBe('http://p1:8080');
    expect(resolveProxyUrl('https://a.test', { ...none, vscodeProxy: 'http://p2' })).toBe('http://p2');
    expect(resolveProxyUrl('https://a.test', { ...none, env: { HTTPS_PROXY: 'http://p3' } })).toBe('http://p3');
  });

  it('uses http proxy variables only for matching scheme fallbacks', () => {
    expect(resolveProxyUrl('http://a.test', { ...none, env: { HTTPS_PROXY: 'http://p3' } })).toBeUndefined();
    expect(resolveProxyUrl('http://a.test', { ...none, env: { http_proxy: 'http://p4' } })).toBe('http://p4');
  });

  it('honours NO_PROXY', () => {
    const sources = { ...none, routiqProxy: 'http://p', env: { NO_PROXY: 'internal.test, .corp' } };
    expect(resolveProxyUrl('https://api.internal.test', sources)).toBeUndefined();
    expect(resolveProxyUrl('https://x.corp', sources)).toBeUndefined();
    expect(resolveProxyUrl('https://other.test', sources)).toBe('http://p');
  });
});
