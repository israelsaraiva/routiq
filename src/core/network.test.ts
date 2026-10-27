import { describe, expect, it } from 'vitest';
import { describeTiming, effectiveTimeoutMs, normalizeMaxRedirects } from './network';

describe('network settings helpers', () => {
  it('falls back for invalid max redirects', () => {
    expect(normalizeMaxRedirects(5)).toBe(5);
    expect(normalizeMaxRedirects(0)).toBe(0);
    expect(normalizeMaxRedirects(-1)).toBe(10);
    expect(normalizeMaxRedirects('x')).toBe(10);
  });

  it('prefers a positive per-request timeout', () => {
    expect(effectiveTimeoutMs(5000, 30000)).toBe(5000);
    expect(effectiveTimeoutMs(undefined, 30000)).toBe(30000);
    expect(effectiveTimeoutMs(0, 30000)).toBe(30000);
  });

  it('describes timing with redirects', () => {
    expect(describeTiming(30)).toBe('Total 30 ms');
    expect(describeTiming(30, { waitMs: 20, downloadMs: 10, redirects: 2 })).toBe('Waiting (TTFB) 20 ms, download 10 ms, total 30 ms, 2 redirects');
  });
});
