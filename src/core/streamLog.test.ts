import { describe, expect, it } from 'vitest';
import { appendCapped, displayedPayload, filterSseLog, filterWebSocketLog, formatBinaryPayload, formatByteSize } from './streamLog';

describe('stream log helpers', () => {
  it('drops the oldest entries beyond the limit', () => {
    expect(appendCapped([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });

  it('filters sse entries by name, data and id case-insensitively', () => {
    const entries = [
      { sequence: 1, timestamp: 0, event: { event: 'tick', data: 'one' } },
      { sequence: 2, timestamp: 0, event: { event: 'message', data: 'Two', id: 'abc' } },
    ];
    expect(filterSseLog(entries, 'TICK')).toHaveLength(1);
    expect(filterSseLog(entries, 'abc')).toHaveLength(1);
    expect(filterSseLog(entries, '  ')).toHaveLength(2);
  });

  it('filters websocket entries by text and direction', () => {
    const entries = [
      { sequence: 1, timestamp: 0, direction: 'sent' as const, text: 'ping', sizeBytes: 4, binary: false },
      { sequence: 2, timestamp: 0, direction: 'received' as const, text: 'pong', sizeBytes: 4, binary: false },
    ];
    expect(filterWebSocketLog(entries, 'received')).toHaveLength(1);
    expect(filterWebSocketLog(entries, 'ping')).toHaveLength(1);
  });

  it('formats sizes', () => {
    expect(formatByteSize(12)).toBe('12 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
  });
});

describe('binary payload formatting', () => {
  const entry = { sequence: 1, timestamp: 0, direction: 'received' as const, text: 'x', sizeBytes: 3, binary: true, payloadBase64: 'AQL/' };

  it('renders hex in rows of 16 bytes and base64 verbatim', () => {
    expect(formatBinaryPayload('AQL/', 'hex')).toBe('01 02 ff');
    expect(formatBinaryPayload(btoa('a'.repeat(17)), 'hex').split('\n')).toHaveLength(2);
    expect(displayedPayload(entry, 'base64')).toBe('AQL/');
  });

  it('shows text for non-binary entries', () => {
    expect(displayedPayload({ ...entry, binary: false }, 'hex')).toBe('x');
  });
});
