import { KafkaMessage } from '../../shared/types';

export const TOMBSTONE_LABEL = 'null (tombstone)';

export function isTombstone(message: Pick<KafkaMessage, 'value' | 'tombstone'>): boolean {
  return message.tombstone ?? message.value === '';
}
