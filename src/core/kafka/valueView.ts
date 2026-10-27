import { KafkaValueFormat } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';
import { fromBase64, toBase64, toHex } from './wireFormat';

export const VALUE_FORMAT_OPTIONS: Array<{ value: KafkaValueFormat; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'hex', label: 'Hex' },
  { value: 'base64', label: 'Base64' },
  { value: 'avro', label: 'Avro' },
  { value: 'protobuf', label: 'Protobuf' },
];

export function messageBase64(message: KafkaMessage): string {
  return message.valueBase64 ?? toBase64(messageBytes(message));
}

export function messageBytes(message: KafkaMessage): Uint8Array {
  return message.valueBase64 ? fromBase64(message.valueBase64) : new TextEncoder().encode(message.value);
}

export function needsHostDecoding(format: KafkaValueFormat, message: KafkaMessage): boolean {
  return format === 'protobuf' || (format === 'avro' && message.valueBase64 !== undefined);
}

export function isStructuredFormat(format: KafkaValueFormat): boolean {
  return format === 'auto' || format === 'json' || format === 'avro' || format === 'protobuf';
}

export function renderValueAs(message: KafkaMessage, format: KafkaValueFormat): string {
  switch (format) {
    case 'hex':
      return toHex(messageBytes(message), Number.MAX_SAFE_INTEGER);
    case 'base64':
      return messageBase64(message);
    case 'text':
      return message.valueBase64 ? new TextDecoder().decode(messageBytes(message)) : message.value;
    case 'json':
    case 'auto':
    case 'avro':
    case 'protobuf':
      return message.value;
  }
}
