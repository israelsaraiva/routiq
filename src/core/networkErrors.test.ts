import { describe, expect, it } from 'vitest';
import { classifyError, isNetworkFailureMessage, resolveTimeoutKind, shapeOf, timeoutMessage, withRoutingHint } from './networkErrors';

describe('classifyError', () => {
  it.each([
    [{ message: 'x', causeCode: 'UND_ERR_CONNECT_TIMEOUT' }, 'connect-timeout'],
    [{ message: 'x', code: 'UND_ERR_HEADERS_TIMEOUT' }, 'response-timeout'],
    [{ message: 'x', causeCode: 'ENOTFOUND' }, 'dns'],
    [{ message: 'x', causeCode: 'ECONNREFUSED' }, 'refused'],
    [{ message: 'x', code: 'ECONNRESET' }, 'reset'],
    [{ message: 'x', causeCode: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }, 'tls'],
    [{ message: 'x', name: 'AbortError' }, 'timeout'],
    [{ message: 'x' }, 'other'],
  ] as const)('classifies %j as %s', (shape, kind) => {
    expect(classifyError(shape)).toBe(kind);
  });

  it('reads code and cause code from an error', () => {
    const error = Object.assign(new Error('fetch failed'), { cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) });
    expect(classifyError(shapeOf(error))).toBe('refused');
  });
});

describe('timeout messages', () => {
  const context = { timeoutMs: 30000, connectTimeoutMs: 10000 };

  it('distinguishes connect from response timeouts', () => {
    expect(timeoutMessage('connect-timeout', context)).toContain('Connect timeout after 10000 ms');
    expect(timeoutMessage('response-timeout', context)).toContain('Response timeout after 30000 ms (waiting for server)');
  });

  it('treats an abort as a response timeout only when the connect timeout is shorter', () => {
    expect(resolveTimeoutKind('timeout', context)).toBe('response-timeout');
    expect(resolveTimeoutKind('timeout', { timeoutMs: 5000, connectTimeoutMs: 10000 })).toBe('timeout');
    expect(resolveTimeoutKind('refused', context)).toBe('refused');
  });
});

describe('routing hint', () => {
  it('is recognised as a network failure and hides proxy credentials', () => {
    const message = withRoutingHint('boom', { followRedirects: true, maxRedirects: 1, rejectUnauthorized: true, proxyUrl: 'http://u:p@proxy:3128' });
    expect(message).toContain('via proxy http://proxy:3128');
    expect(isNetworkFailureMessage(message)).toBe(true);
    expect(isNetworkFailureMessage('Request aborted')).toBe(false);
  });
});
