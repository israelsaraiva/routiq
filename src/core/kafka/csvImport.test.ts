import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { importCsv, looksLikeRoutiqCsv, parseCsvRows } from './csvImport';
import { importLogFile } from './logImport';
import { exportAsCsv } from './messageExport';

const message = (overrides: Partial<KafkaMessage> = {}): KafkaMessage => ({
  id: 'x',
  flowId: 'f',
  timestamp: 1699999999000,
  receivedAt: 1700000000000,
  topic: 'orders',
  partition: 1,
  offset: '42',
  key: 'k',
  value: 'v',
  headers: { h: '1' },
  ...overrides,
});

describe('parseCsvRows', () => {
  it('handles quotes, embedded newlines, CRLF and a missing trailing newline', () => {
    expect(parseCsvRows('a,"b ""q"""\r\n"x\ny",z')).toEqual([['a', 'b "q"'], ['x\ny', 'z']]);
  });
});

describe('importCsv', () => {
  it('round trips quotes, newlines, unicode, empty strings and tombstones', () => {
    const original = [
      message({ value: 'a,"b"\nc ✓ 日本', key: null, offset: '1' }),
      message({ value: '', tombstone: false, offset: '2' }),
      message({ value: '', tombstone: true, offset: '3' }),
      message({ value: '{"x":1}', headers: { a: 'é', b: 'multi\nline' }, offset: '4' }),
    ];
    const { messages, error } = importCsv(exportAsCsv(original));
    expect(error).toBeNull();
    expect(messages).toHaveLength(4);
    expect(messages.map((m) => m.value)).toEqual(original.map((m) => m.value));
    expect(messages.map((m) => m.tombstone)).toEqual([false, false, true, false]);
    expect(messages[0]).toMatchObject({ key: null, topic: 'orders', partition: 1, offset: '1', timestamp: 1699999999000 });
    expect(messages[3].headers).toEqual({ a: 'é', b: 'multi\nline' });
  });

  it('imports legacy exports without a tombstone column as plain values', () => {
    const csv = 'topic,partition,offset,key,timestamp,timestampIso,receivedAt,receivedAtIso,headers,value\r\norders,0,5,,1,,,,{},\r\n';
    expect(importCsv(csv).messages[0]).toMatchObject({ offset: '5', value: '', tombstone: false });
  });

  it('accepts a byte order mark before the header', () => {
    expect(importCsv(`\uFEFF${exportAsCsv([message()])}`).messages).toHaveLength(1);
  });

  it('rejects files that are not Routiq exports', () => {
    expect(importCsv('a,b\n1,2').error).toMatch(/Not a Routiq CSV export/);
    expect(looksLikeRoutiqCsv('a,b\n1,2')).toBe(false);
  });
});

describe('importLogFile', () => {
  it('routes csv files to the csv importer and others to the json importer', () => {
    const csv = exportAsCsv([message()]);
    expect(importLogFile({ name: 'export.csv', text: csv }).messages).toHaveLength(1);
    expect(importLogFile({ name: 'renamed.txt', text: csv }).messages).toHaveLength(1);
    expect(importLogFile({ name: 'a.json', text: '[]' }).messages).toEqual([]);
  });
});
