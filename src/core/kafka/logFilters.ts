import { KafkaMessage } from '../../shared/types';

export type LogFilterType = 'none' | 'container' | 'level';

export function filterByType(messages: KafkaMessage[], filterType: LogFilterType, filterValue: string): KafkaMessage[] {
  if (filterType === 'none' || !filterValue) {
    return messages;
  }
  if (filterType === 'container') {
    return messages.filter((message) => message.containerName === filterValue);
  }
  return messages.filter((message) => message.level?.toLowerCase() === filterValue.toLowerCase());
}

export function filterBySearchQuery(messages: KafkaMessage[], searchQuery: string): KafkaMessage[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return messages;
  }
  return messages.filter((message) => [message.value, message.containerName ?? '', message.level ?? ''].some((field) => field.toLowerCase().includes(query)));
}

export function uniqueContainers(messages: KafkaMessage[]): string[] {
  return [...new Set(messages.flatMap((message) => (message.containerName ? [message.containerName] : [])))].sort();
}

export function uniqueLevels(messages: KafkaMessage[]): string[] {
  return [...new Set(messages.flatMap((message) => (message.level ? [message.level.toLowerCase()] : [])))].sort();
}

export function sortByTimestamp(messages: KafkaMessage[], ascending: boolean): KafkaMessage[] {
  return [...messages].sort((left, right) => (ascending ? left.timestamp - right.timestamp : right.timestamp - left.timestamp));
}
