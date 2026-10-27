import { describe, expect, it } from 'vitest';
import { HistoryEntry } from '../shared/types';
import { addEntry, createHistoryEntry, formatRelativeTime, removeEntry, toSummary, trimEntries, truncateBody } from './history';

const request = {
  id: 'r1',
  name: 'n',
  method: 'GET' as const,
  url: 'http://a',
  params: [],
  headers: [],
  body: { type: 'none' as const, text: '', form: [] },
  auth: { type: 'none' as const },
};

const entryAt = (timestamp: number, id = String(timestamp)): HistoryEntry => ({
  ...createHistoryEntry(
    {
      request,
      finalUrl: 'http://a/?q=1',
      requestHeaders: { Accept: '*/*' },
      response: { status: 200, statusText: 'OK', timeMs: 5, sizeBytes: 2, headers: [['a', 'b']], body: 'hi' },
      timestamp,
      id,
    },
    100,
  ),
});

describe('truncateBody', () => {
  it('keeps bodies within the limit', () => {
    expect(truncateBody('abc', 3)).toEqual({ text: 'abc', truncated: false });
  });

  it('cuts at the byte limit and flags truncation', () => {
    expect(truncateBody('abcdef', 4)).toEqual({ text: 'abcd', truncated: true });
  });

  it('drops a partially cut multibyte character', () => {
    expect(truncateBody('aé', 2)).toEqual({ text: 'a', truncated: true });
  });

  it('handles a zero limit', () => {
    expect(truncateBody('abc', 0)).toEqual({ text: '', truncated: true });
  });
});

describe('createHistoryEntry', () => {
  it('snapshots request and truncates response body', () => {
    const entry = createHistoryEntry(
      {
        request,
        finalUrl: 'http://a/?q=1',
        requestHeaders: { Accept: '*/*' },
        requestBody: 'x',
        response: { status: 500, statusText: 'ERR', timeMs: 9, sizeBytes: 10, headers: [], body: '0123456789' },
        timestamp: 1,
        id: 'e',
      },
      4,
    );
    expect(entry).toMatchObject({
      url: 'http://a/?q=1',
      status: 500,
      durationMs: 9,
      responseBody: '0123',
      bodyTruncated: true,
      requestHeaders: [['Accept', '*/*']],
      requestSnapshot: request,
    });
  });
});

describe('trimming', () => {
  it('keeps the newest entries up to the cap', () => {
    const entries = [entryAt(1), entryAt(3), entryAt(2)];
    expect(trimEntries(entries, 2).map((entry) => entry.timestamp)).toEqual([3, 2]);
  });

  it('prepends new entries and trims', () => {
    const result = addEntry([entryAt(2), entryAt(1)], entryAt(3), 2);
    expect(result.map((entry) => entry.timestamp)).toEqual([3, 2]);
  });

  it('empties history for a zero cap', () => {
    expect(trimEntries([entryAt(1)], 0)).toEqual([]);
  });
});

describe('removeEntry and toSummary', () => {
  it('removes by id', () => {
    expect(removeEntry([entryAt(1), entryAt(2)], '1').map((entry) => entry.id)).toEqual(['2']);
  });

  it('summaries omit bodies', () => {
    expect(toSummary(entryAt(1))).not.toHaveProperty('responseBody');
  });
});

describe('formatRelativeTime', () => {
  it('formats units', () => {
    expect(formatRelativeTime(0, 30_000)).toBe('just now');
    expect(formatRelativeTime(0, 5 * 60_000)).toBe('5m ago');
    expect(formatRelativeTime(0, 3 * 3_600_000)).toBe('3h ago');
    expect(formatRelativeTime(0, 2 * 86_400_000)).toBe('2d ago');
  });
});
