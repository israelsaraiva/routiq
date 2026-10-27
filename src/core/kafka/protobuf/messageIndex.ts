export interface MessageIndex {
  path: number[];
  payloadOffset: number;
}

interface Varint {
  value: number;
  next: number;
}

const MAX_VARINT_BYTES = 5;
const CONTINUATION_BIT = 0x80;
const PAYLOAD_BITS = 0x7f;

function readVarint(bytes: Uint8Array, offset: number): Varint {
  let value = 0;
  for (let position = 0; position < MAX_VARINT_BYTES; position++) {
    const byte = bytes[offset + position];
    if (byte === undefined) {
      throw new Error('Truncated protobuf message index');
    }
    value += (byte & PAYLOAD_BITS) * 2 ** (7 * position);
    if ((byte & CONTINUATION_BIT) === 0) {
      return { value, next: offset + position + 1 };
    }
  }
  throw new Error('Invalid protobuf message index');
}

function readZigZag(bytes: Uint8Array, offset: number): Varint {
  const { value, next } = readVarint(bytes, offset);
  return { value: value % 2 === 0 ? value / 2 : -(value + 1) / 2, next };
}

export function parseMessageIndex(bytes: Uint8Array, offset: number): MessageIndex {
  const { value: length, next: afterLength } = readZigZag(bytes, offset);
  if (length === 0) {
    return { path: [0], payloadOffset: afterLength };
  }
  const path: number[] = [];
  let cursor = afterLength;
  for (let entry = 0; entry < length; entry++) {
    const { value, next } = readZigZag(bytes, cursor);
    path.push(value);
    cursor = next;
  }
  return { path, payloadOffset: cursor };
}

function encodeZigZag(value: number): number {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= CONTINUATION_BIT) {
    bytes.push((remaining % CONTINUATION_BIT) | CONTINUATION_BIT);
    remaining = Math.floor(remaining / CONTINUATION_BIT);
  }
  return [...bytes, remaining];
}

export function encodeMessageIndex(path: number[]): Uint8Array {
  const isDefault = path.length === 1 && path[0] === 0;
  const values = isDefault ? [0] : [path.length, ...path];
  return Uint8Array.from(values.flatMap((value) => encodeVarint(encodeZigZag(value))));
}
