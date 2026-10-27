import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { filterMessages, flowDurationSeconds, groupByFlow, isLinkedFlow, uniqueTopics } from './flowGroups';

function make(id: string, flowId: string, timestamp: number, extra: Partial<KafkaMessage> = {}): KafkaMessage {
  return { id, flowId, timestamp, topic: 'orders', partition: 0, offset: id, key: null, value: '{}', ...extra };
}

describe('groupByFlow', () => {
  it('sorts groups by latest message and messages newest first', () => {
    const groups = groupByFlow([make('1', 'a', 1000), make('2', 'b', 5000), make('3', 'a', 3000)]);
    expect(groups.map((group) => group.flowId)).toEqual(['b', 'a']);
    expect(groups[1].messages.map((message) => message.id)).toEqual(['3', '1']);
    expect(flowDurationSeconds(groups[1])).toBe(2);
  });
});

describe('filters', () => {
  const messages = [make('1', 'a', 1, { value: '{"user":"Ana"}' }), make('2', 'b', 2, { topic: 'pay', headers: { h: 'secret' } })];

  it('searches value, headers and topic', () => {
    expect(filterMessages(messages, 'ana', null)).toHaveLength(1);
    expect(filterMessages(messages, 'SECRET', null)).toHaveLength(1);
    expect(filterMessages(messages, '', 'pay')).toHaveLength(1);
  });

  it('lists unique topics and linked flows', () => {
    expect(uniqueTopics(messages)).toEqual(['orders', 'pay']);
    expect(isLinkedFlow('unknown')).toBe(false);
    expect(isLinkedFlow('abc')).toBe(true);
  });
});
