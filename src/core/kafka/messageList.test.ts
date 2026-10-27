import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { buildKafkaMessage, prependMessages, removeMessages } from './messageList';

const make = (id: string): KafkaMessage => ({ id, flowId: 'f', timestamp: 1, topic: 't', partition: 0, offset: id, key: null, value: '' });

describe('buildKafkaMessage', () => {
  it('maps a raw record with headers and flow id', () => {
    const message = buildKafkaMessage(
      { topic: 't', partition: 2, message: { offset: '9', key: Buffer.from('k'), value: Buffer.from('{"flowId":"x"}'), headers: { h: Buffer.from('v') } } },
      42,
    );
    expect(message).toMatchObject({ id: 't-2-9', key: 'k', headers: { h: 'v' }, flowId: 'x', timestamp: 42 });
  });
});

describe('message list', () => {
  it('prepends newest first, dedupes and caps', () => {
    const result = prependMessages([make('1')], [make('1'), make('2'), make('3')], 2);
    expect(result.map((message) => message.id)).toEqual(['3', '2']);
  });

  it('removes by id', () => {
    expect(removeMessages([make('1'), make('2')], ['1']).map((message) => message.id)).toEqual(['2']);
  });
});
