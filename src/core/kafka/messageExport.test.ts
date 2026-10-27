import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { parseJsonFile } from './jsonLogParser';
import { escapeCsvField, exportAsCsv, exportAsJson, exportAsNdjson, exportFileName, messagesFromLogEntries, serializeMessages } from './messageExport';

const message = (overrides: Partial<KafkaMessage> = {}): KafkaMessage => ({
  id: 'orders-1-42',
  flowId: 'unknown',
  timestamp: 1700000000000,
  recordTimestamp: 1699999999000,
  topic: 'orders',
  partition: 1,
  offset: '42',
  key: 'k1',
  value: '{"a":1}',
  headers: { source: 'unit' },
  ...overrides,
});

describe('escapeCsvField', () => {
  it('quotes commas, quotes and newlines and keeps unicode', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('cr\rlf')).toBe('"cr\rlf"');
    expect(escapeCsvField('héllo ✓ 日本')).toBe('héllo ✓ 日本');
  });
});

describe('exportAsCsv', () => {
  it('writes a header and one escaped row per message', () => {
    const csv = exportAsCsv([message({ key: null, value: 'a,"b"\nc ✓', headers: undefined })]);
    const [header, ...rest] = csv.split('\r\n');
    expect(header).toBe('topic,partition,offset,key,timestamp,timestampIso,receivedAt,receivedAtIso,headers,value');
    expect(rest.join('\r\n')).toBe('orders,1,42,,1699999999000,2023-11-14T22:13:19.000Z,1700000000000,2023-11-14T22:13:20.000Z,{},"a,""b""\nc ✓"\r\n');
  });

  it('quotes JSON headers because they contain commas and quotes', () => {
    expect(exportAsCsv([message({ headers: { a: '1', b: '2' } })])).toContain('"{""a"":""1"",""b"":""2""}"');
  });
});

describe('exportAsNdjson', () => {
  it('writes one JSON object per line and nothing for an empty list', () => {
    const lines = exportAsNdjson([message(), message({ offset: '43' })]).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).offset).toBe('43');
    expect(exportAsNdjson([])).toBe('');
  });
});

describe('round trip', () => {
  const originals = [
    message(),
    message({ offset: '43', key: null, value: 'multi\nline "text", ✓', headers: undefined, recordTimestamp: undefined }),
    message({ topic: 'payments', partition: 0, offset: '7', value: '' }),
  ];
  const expectSameRecords = (imported: KafkaMessage[]) =>
    expect(imported.map(({ topic, partition, offset, key, value, headers, timestamp, recordTimestamp }) => ({ topic, partition, offset, key, value, headers, timestamp, recordTimestamp }))).toEqual(
      originals.map(({ topic, partition, offset, key, value, headers, timestamp, recordTimestamp }) => ({ topic, partition, offset, key, value, headers, timestamp, recordTimestamp })),
    );

  it.each(['json', 'ndjson'] as const)('imports a %s export through the log file parser', (format) => {
    const { entries, error } = parseJsonFile(serializeMessages(originals, format));
    expect(error).toBeNull();
    expectSameRecords(messagesFromLogEntries(entries));
  });

  it('exports valid JSON', () => {
    expect(JSON.parse(exportAsJson(originals))).toHaveLength(3);
  });

  it('keeps Splunk entries importable next to Routiq records', () => {
    const splunk = { result: { _raw: '{"flowId":"f"}', _time: '2024-01-01T00:00:00Z' } };
    const imported = messagesFromLogEntries([...(parseJsonFile(exportAsJson([message()])).entries), splunk]);
    expect(imported[0].topic).toBe('orders');
    expect(imported.length).toBeGreaterThanOrEqual(1);
  });
});

describe('exportFileName', () => {
  it('swaps the extension for the chosen format', () => {
    expect(exportFileName('kafka-messages-2024.json', 'csv')).toBe('kafka-messages-2024.csv');
    expect(exportFileName('plain', 'ndjson')).toBe('plain.ndjson');
  });
});
