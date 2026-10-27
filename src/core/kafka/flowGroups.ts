import { KafkaMessage } from '../../shared/types';
import { parseJsonOrText } from './messageParsing';

export interface FlowGroup {
  flowId: string;
  messages: KafkaMessage[];
  firstTimestamp: number;
  lastTimestamp: number;
}

export function groupByFlow(messages: KafkaMessage[]): FlowGroup[] {
  const byFlow = new Map<string, KafkaMessage[]>();
  for (const message of messages) {
    byFlow.set(message.flowId, [...(byFlow.get(message.flowId) ?? []), message]);
  }
  const groups = [...byFlow].map(([flowId, members]) => buildGroup(flowId, members));
  return groups.sort((left, right) => right.lastTimestamp - left.lastTimestamp);
}

function buildGroup(flowId: string, members: KafkaMessage[]): FlowGroup {
  const sorted = [...members].sort((left, right) => right.timestamp - left.timestamp);
  return { flowId, messages: sorted, firstTimestamp: sorted[sorted.length - 1].timestamp, lastTimestamp: sorted[0].timestamp };
}

export function flowDurationSeconds(group: FlowGroup): number {
  return Math.round((group.lastTimestamp - group.firstTimestamp) / 1000);
}

export function buildFlowExport(group: FlowGroup): string {
  const flow = {
    flowId: group.flowId,
    firstMessage: new Date(group.firstTimestamp).toISOString(),
    lastMessage: new Date(group.lastTimestamp).toISOString(),
    duration: flowDurationSeconds(group),
    messageCount: group.messages.length,
    messages: group.messages.map(({ timestamp, ...message }) => ({ ...message, timestamp: new Date(timestamp).toISOString() })),
  };
  return JSON.stringify(flow, null, 2);
}

export function flowExportFileName(group: FlowGroup, now: Date): string {
  return `flow-${group.flowId}-${now.toISOString().split('T')[0]}.json`;
}

export function messagesExportFileName(now: Date): string {
  return `kafka-messages-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
}

export function isLinkedFlow(flowId: string): boolean {
  return flowId !== 'unknown' && flowId !== 'error';
}

export function matchesSearch(message: KafkaMessage, query: string): boolean {
  const needle = query.toLowerCase().trim();
  if (!needle) {
    return true;
  }
  const headers = message.headers ? JSON.stringify(message.headers) : '';
  const compactValue = JSON.stringify(parseJsonOrText(message.value));
  return [message.value, message.topic, message.flowId, message.key ?? '', headers, compactValue].some((field) => field.toLowerCase().includes(needle));
}

export function filterMessages(messages: KafkaMessage[], query: string, topic: string | null): KafkaMessage[] {
  return messages.filter((message) => (!topic || message.topic === topic) && matchesSearch(message, query));
}

export function uniqueTopics(messages: KafkaMessage[]): string[] {
  return [...new Set(messages.map((message) => message.topic))].sort();
}
