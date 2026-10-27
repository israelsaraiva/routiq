import { describe, expect, it } from 'vitest';
import { encodeMessageIndex, parseMessageIndex } from './messageIndex';
import { hasLocalProtobuf, parseTopicTypes, resolveMessageType } from './topicTypes';

describe('message index', () => {
  it('treats a single zero byte as the first message type', () => {
    expect(parseMessageIndex(Uint8Array.from([0, 9]), 0)).toEqual({ path: [0], payloadOffset: 1 });
  });

  it.each([[[1]], [[2, 0]], [[0, 3, 70]], [[300, 5]]])('round trips path %j', (path) => {
    const encoded = encodeMessageIndex(path);
    const payload = Uint8Array.from([...encoded, 42]);
    expect(parseMessageIndex(payload, 0)).toEqual({ path, payloadOffset: encoded.length });
  });

  it('reads at an offset and rejects truncated input', () => {
    const bytes = Uint8Array.from([0, 0, 0, 0, 0, ...encodeMessageIndex([4])]);
    expect(parseMessageIndex(bytes, 5).path).toEqual([4]);
    expect(() => parseMessageIndex(Uint8Array.from([4, 2]), 0)).toThrow();
  });
});

describe('protobuf settings', () => {
  it('parses topic=Type pairs separated by newlines, commas and semicolons', () => {
    expect([...parseTopicTypes('a=pkg.A\n b = pkg.B, c=pkg.C;bad;=x;d=')]).toEqual([
      ['a', 'pkg.A'],
      ['b', 'pkg.B'],
      ['c', 'pkg.C'],
    ]);
  });

  it('prefers the topic mapping over the default type', () => {
    const settings = { messageType: ' pkg.Default ', topicTypes: 'orders=pkg.Order' };
    expect(resolveMessageType(settings, 'orders')).toBe('pkg.Order');
    expect(resolveMessageType(settings, 'other')).toBe('pkg.Default');
    expect(resolveMessageType(undefined, 'other')).toBeUndefined();
  });

  it('requires a non blank file', () => {
    expect(hasLocalProtobuf({ file: ' ' })).toBe(false);
    expect(hasLocalProtobuf({ file: 'a.proto' })).toBe(true);
  });
});
