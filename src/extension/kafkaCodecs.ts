import { CompressionCodecs, CompressionTypes } from 'kafkajs';
import { lz4Codec, snappyCodec, zstdCodec } from '../core/kafka/compressionCodecs';

let registered = false;

export function registerCompressionCodecs(): void {
  if (registered) {
    return;
  }
  registered = true;
  CompressionCodecs[CompressionTypes.Snappy] = () => snappyCodec;
  CompressionCodecs[CompressionTypes.LZ4] = () => lz4Codec;
  CompressionCodecs[CompressionTypes.ZSTD] = () => zstdCodec;
}
