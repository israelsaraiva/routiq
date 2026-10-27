import { describe, expect, it } from 'vitest';
import { exportAsJson, exportAsNdjson, importExportedRecord, toExportedRecord } from './messageExport';
import { KafkaMessage } from '../../shared/types';
import { isTombstone } from './tombstone';
import { buildKafkaMessage } from './messageList';

describe('tombstones', () => {
  it('uses the explicit flag and falls back to the empty value for legacy history', () => {
    expect(isTombstone({ value: '', tombstone: true })).toBe(true);
    expect(isTombstone({ value: '', tombstone: false })).toBe(false);
    expect(isTombstone({ value: '' })).toBe(true);
    expect(isTombstone({ value: 'x' })).toBe(false);
  });

  it('exports null and keeps it distinguishable from an empty string', () => {
    const tombstone = { id: 'a', flowId: 'f', timestamp: 1, topic: 't', partition: 0, offset: '1', key: 'k', value: '', tombstone: true } as KafkaMessage;
    const empty = { ...tombstone, tombstone: false };
    expect(toExportedRecord(tombstone).value).toBeNull();
    expect(toExportedRecord(empty).value).toBe('');
    expect(JSON.parse(exportAsJson([tombstone]))[0].value).toBeNull();
    expect(JSON.parse(exportAsNdjson([empty])).value).toBe('');
    expect(importExportedRecord(toExportedRecord(tombstone)).tombstone).toBe(true);
    expect(importExportedRecord(toExportedRecord(empty)).tombstone).toBe(false);
  });
});

describe('buildKafkaMessage', () => {
  const record = (value: Buffer | null) => ({ topic: 't', partition: 0, message: { offset: '1', key: null, value, timestamp: '1', headers: {} } });

  it('flags a null kafka value as tombstone and an empty value as not', () => {
    expect(buildKafkaMessage(record(null) as never, 1)).toMatchObject({ tombstone: true, value: '' });
    expect(buildKafkaMessage(record(Buffer.alloc(0)) as never, 1).tombstone).toBe(false);
  });
});
