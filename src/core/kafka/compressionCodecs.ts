import { decompress as zstdDecompress } from 'fzstd';
import { compress as lz4Compress, decompress as lz4Decompress } from 'lz4js';
import { compress as snappyCompress, uncompress as snappyUncompress } from 'snappyjs';

export interface CompressionCodec {
  compress(encoder: { buffer: Buffer }): Promise<Buffer>;
  decompress(buffer: Buffer): Promise<Buffer>;
}

export const SUPPORTED_CODECS = ['gzip', 'snappy', 'lz4', 'zstd'];

const XERIAL_MAGIC = Buffer.from([0x82, 0x53, 0x4e, 0x41, 0x50, 0x50, 0x59, 0x00]);
const XERIAL_HEADER_BYTES = 16;
const XERIAL_VERSION = 1;
const XERIAL_MIN_COMPATIBLE_VERSION = 1;

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function isXerialFramed(buffer: Buffer): boolean {
  return buffer.length >= XERIAL_HEADER_BYTES && buffer.subarray(0, XERIAL_MAGIC.length).equals(XERIAL_MAGIC);
}

export function decodeXerialSnappy(buffer: Buffer): Buffer {
  const blocks: Buffer[] = [];
  for (let position = XERIAL_HEADER_BYTES; position < buffer.length; ) {
    const length = buffer.readUInt32BE(position);
    const start = position + 4;
    blocks.push(toBuffer(snappyUncompress(buffer.subarray(start, start + length))));
    position = start + length;
  }
  return Buffer.concat(blocks);
}

export function encodeXerialSnappy(data: Buffer): Buffer {
  const header = Buffer.alloc(XERIAL_HEADER_BYTES);
  XERIAL_MAGIC.copy(header);
  header.writeInt32BE(XERIAL_VERSION, XERIAL_MAGIC.length);
  header.writeInt32BE(XERIAL_MIN_COMPATIBLE_VERSION, XERIAL_MAGIC.length + 4);
  const block = toBuffer(snappyCompress(data));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(block.length);
  return Buffer.concat([header, length, block]);
}

export const snappyCodec: CompressionCodec = {
  compress: async ({ buffer }) => encodeXerialSnappy(buffer),
  decompress: async (buffer) => (isXerialFramed(buffer) ? decodeXerialSnappy(buffer) : toBuffer(snappyUncompress(buffer))),
};

export const lz4Codec: CompressionCodec = {
  compress: async ({ buffer }) => toBuffer(lz4Compress(buffer)),
  decompress: async (buffer) => toBuffer(lz4Decompress(buffer)),
};

export const zstdCodec: CompressionCodec = {
  compress: async () => {
    throw new Error('Producing zstd-compressed messages is not supported. Use gzip, snappy or lz4, or no compression.');
  },
  decompress: async (buffer) => toBuffer(zstdDecompress(buffer)),
};
