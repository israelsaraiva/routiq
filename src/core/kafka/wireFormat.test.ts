import { describe, expect, it } from 'vitest';
import { fromBase64, isBinaryPayload, parseConfluentEnvelope, toBase64, toHex } from './wireFormat';

describe('confluent wire format', () => {
  it('reads the schema id after the magic byte', () => {
    expect(parseConfluentEnvelope(Uint8Array.from([0, 0, 0, 1, 2, 9, 9]))).toEqual({ schemaId: 258, payloadOffset: 5 });
  });

  it('rejects payloads without the magic byte or body', () => {
    expect(parseConfluentEnvelope(Uint8Array.from([1, 0, 0, 0, 1, 9]))).toBeUndefined();
    expect(parseConfluentEnvelope(Uint8Array.from([0, 0, 0, 0, 1]))).toBeUndefined();
  });

  it('detects binary payloads', () => {
    expect(isBinaryPayload(Uint8Array.from([0, 1, 2]))).toBe(true);
    expect(isBinaryPayload(Uint8Array.from([0xff, 0xfe]))).toBe(true);
    expect(isBinaryPayload(new TextEncoder().encode('{"a":1}'))).toBe(false);
  });

  it('round-trips base64 and previews hex', () => {
    const bytes = Uint8Array.from([0, 255, 16]);
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual([0, 255, 16]);
    expect(toHex(bytes)).toBe('00 ff 10');
    expect(toHex(bytes, 2)).toBe('00 ff … (3 bytes)');
  });
});
