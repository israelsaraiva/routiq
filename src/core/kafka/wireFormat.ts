const MAGIC_BYTE = 0;
const HEADER_LENGTH = 5;
const HEX_PREVIEW_BYTES = 256;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export interface ConfluentEnvelope {
  schemaId: number;
  payloadOffset: number;
}

export function parseConfluentEnvelope(bytes: Uint8Array): ConfluentEnvelope | undefined {
  if (bytes.length <= HEADER_LENGTH || bytes[0] !== MAGIC_BYTE) {
    return undefined;
  }
  const schemaId = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1);
  return { schemaId, payloadOffset: HEADER_LENGTH };
}

export function decodeUtf8Strict(bytes: Uint8Array): string | undefined {
  try {
    return UTF8.decode(bytes);
  } catch {
    return undefined;
  }
}

export function isBinaryPayload(bytes: Uint8Array): boolean {
  return bytes.length > 0 && (bytes[0] === MAGIC_BYTE || decodeUtf8Strict(bytes) === undefined);
}

export function toHex(bytes: Uint8Array, limit = HEX_PREVIEW_BYTES): string {
  const shown = Array.from(bytes.subarray(0, limit), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
  return bytes.length > limit ? `${shown} … (${bytes.length} bytes)` : shown;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function captureBinaryValue(raw: unknown): string | undefined {
  return raw instanceof Uint8Array && isBinaryPayload(raw) ? toBase64(raw) : undefined;
}
