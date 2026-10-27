import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { buildMessageExport, buildMessagesExport, formatMessageContent, parseMessage, serializeHeaders } from './messageParsing';

const message: KafkaMessage = { id: 'a', flowId: 'f', timestamp: 0, topic: 't', partition: 1, offset: '2', key: null, value: '{"x":1}' };

describe('parseMessage', () => {
  it('extracts command, source, success and error', () => {
    const value = JSON.stringify({ host: 'svc', resource: { commandId: 'CreateUser:123', payload: { errorMessage: 'boom' }, success: false } });
    expect(parseMessage(value)).toMatchObject({ commandName: 'CreateUser', sourceMicroservice: 'svc', errorMessage: 'boom' });
  });

  it('returns empty data for non JSON', () => {
    expect(parseMessage('not json')).toEqual({});
  });
});

describe('formatting and export', () => {
  it('pretty prints JSON and keeps text', () => {
    expect(formatMessageContent('{"a":1}')).toBe('{\n    "a": 1\n}');
    expect(formatMessageContent('hello')).toBe('hello');
  });

  it('exports parsed values and ISO timestamps', () => {
    expect(buildMessageExport(message)).toMatchObject({ value: { x: 1 }, timestamp: '1970-01-01T00:00:00.000Z' });
    expect(JSON.parse(buildMessagesExport([message]))).toHaveLength(1);
  });

  it('serializes headers only when present', () => {
    expect(serializeHeaders(undefined)).toBe('');
    expect(serializeHeaders({ a: 'b' })).toContain('"a": "b"');
  });
});
