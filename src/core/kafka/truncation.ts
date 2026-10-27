import { KafkaMessage } from '../../shared/types';

export const DEFAULT_MAX_MESSAGE_BYTES_DISPLAYED = 100000;
const MAX_BYTES_PER_CHARACTER = 3;
const REPLACEMENT_CHARACTER = /\uFFFD+$/;

export interface TruncatedValue {
  value: string;
  truncated: boolean;
  size: number;
}

export function truncateValue(value: string, maxBytes: number): TruncatedValue {
  if (maxBytes <= 0 || value.length * MAX_BYTES_PER_CHARACTER <= maxBytes) {
    return { value, truncated: false, size: value.length };
  }
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= maxBytes) {
    return { value, truncated: false, size: bytes.length };
  }
  const head = new TextDecoder().decode(bytes.subarray(0, maxBytes)).replace(REPLACEMENT_CHARACTER, '');
  return { value: head, truncated: true, size: bytes.length };
}

export function limitMessageSize(message: KafkaMessage, maxBytes: number): KafkaMessage {
  const { value, truncated, size } = truncateValue(message.value, maxBytes);
  if (!truncated) {
    return message;
  }
  const { valueBase64: _valueBase64, ...rest } = message;
  return { ...rest, value, valueTruncated: true, valueSize: size };
}

export function limitMessageSizes(messages: KafkaMessage[], maxBytes: number): KafkaMessage[] {
  return messages.map((message) => limitMessageSize(message, maxBytes));
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
