import { describe, expect, it } from 'vitest';
import { decodeXerialSnappy, encodeXerialSnappy, lz4Codec, snappyCodec, zstdCodec } from './compressionCodecs';

const payload = Buffer.from('{"flowId":"f1","text":"'.concat('hello kafka '.repeat(200), '"}'));

describe('compression codecs', () => {
  it('round-trips snappy with xerial framing', async () => {
    const compressed = await snappyCodec.compress({ buffer: payload });
    expect(decodeXerialSnappy(compressed).equals(payload)).toBe(true);
    expect((await snappyCodec.decompress(encodeXerialSnappy(payload))).equals(payload)).toBe(true);
  });

  it('round-trips lz4', async () => {
    const compressed = await lz4Codec.compress({ buffer: payload });
    expect((await lz4Codec.decompress(compressed)).equals(payload)).toBe(true);
  });

  it('explains that zstd production is unsupported', async () => {
    await expect(zstdCodec.compress({ buffer: payload })).rejects.toThrow(/zstd/);
  });
});
