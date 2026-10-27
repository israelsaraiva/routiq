import { describe, expect, it } from 'vitest';
import {
  addTopicToList,
  buildGroupDetail,
  buildGroupOffsets,
  buildTopicCreation,
  calculateLag,
  describeAdminError,
  filterTopics,
  parseTopicConfigText,
  resolveResetOffset,
  summarizeTopic,
  topicsOfGroup,
  validateTopicCreation,
} from './admin';

const metadata = {
  name: 'orders',
  partitions: [
    { partition: 1, leader: 2, replicas: [2, 3], isr: [2] },
    { partition: 0, leader: 1, replicas: [1, 2], isr: [1, 2] },
  ],
};

describe('summarizeTopic', () => {
  it('sums message counts, sorts partitions and derives the replication factor', () => {
    const topic = summarizeTopic(metadata, [
      { partition: 0, low: '5', high: '15' },
      { partition: 1, low: '0', high: '7' },
    ]);
    expect(topic.messageCount).toBe(17);
    expect(topic.replicationFactor).toBe(2);
    expect(topic.partitions.map((partition) => partition.partition)).toEqual([0, 1]);
    expect(topic.internal).toBe(false);
  });

  it('flags internal topics and tolerates missing offsets', () => {
    const topic = summarizeTopic({ name: '__consumer_offsets', partitions: [] }, []);
    expect(topic).toMatchObject({ internal: true, messageCount: 0, replicationFactor: 0 });
  });
});

describe('filterTopics', () => {
  const topics = [summarizeTopic(metadata, []), summarizeTopic({ name: '__consumer_offsets', partitions: [] }, [])];

  it('hides internal topics unless requested', () => {
    expect(filterTopics(topics, '', false).map((topic) => topic.name)).toEqual(['orders']);
    expect(filterTopics(topics, '', true)).toHaveLength(2);
  });

  it('matches case-insensitively', () => {
    expect(filterTopics(topics, 'ORD', true).map((topic) => topic.name)).toEqual(['orders']);
  });
});

describe('calculateLag', () => {
  it('is the distance between committed offset and log end', () => {
    expect(calculateLag('40', '0', '100')).toBe(60);
  });

  it('counts every retained message when nothing was committed', () => {
    expect(calculateLag(null, '10', '100')).toBe(90);
    expect(calculateLag('-1', '10', '100')).toBe(90);
  });

  it('counts from the earliest offset when the commit has expired', () => {
    expect(calculateLag('3', '10', '100')).toBe(90);
  });

  it('never goes negative', () => {
    expect(calculateLag('120', '0', '100')).toBe(0);
  });
});

describe('group detail', () => {
  const watermarks = new Map([['orders', [{ partition: 0, low: '0', high: '10' }, { partition: 1, low: '0', high: '20' }]]]);

  it('computes per partition lag and total lag', () => {
    const offsets = buildGroupOffsets(
      [
        { topic: 'orders', partition: 1, offset: '5' },
        { topic: 'orders', partition: 0, offset: '-1' },
      ],
      watermarks,
    );
    expect(offsets).toEqual([
      { topic: 'orders', partition: 0, committed: null, logEnd: '10', lag: 10 },
      { topic: 'orders', partition: 1, committed: '5', logEnd: '20', lag: 15 },
    ]);
    const detail = buildGroupDetail(
      { groupId: 'g', state: 'Stable', protocol: 'range', protocolType: 'consumer', members: [{ memberId: 'm', clientId: 'c', host: '/h', assignment: { orders: [1, 0] } }] },
      offsets,
    );
    expect(detail.totalLag).toBe(25);
    expect(detail.members[0].assignments).toEqual([{ topic: 'orders', partitions: [0, 1] }]);
  });

  it('collects topics from commits and assignments', () => {
    const members = [{ memberId: 'm', clientId: 'c', host: 'h', assignment: { b: [0] } }];
    expect(topicsOfGroup([{ topic: 'a', partition: 0, offset: '1' }], members)).toEqual(['a', 'b']);
  });
});

describe('resolveResetOffset', () => {
  const bounds = { partition: 0, low: '2', high: '9' };

  it('resolves earliest and latest from the watermarks', () => {
    expect(resolveResetOffset({ kind: 'earliest' }, bounds, undefined)).toBe('2');
    expect(resolveResetOffset({ kind: 'latest' }, bounds, undefined)).toBe('9');
  });

  it('uses the timestamp offset, falling back to latest when no message is newer', () => {
    expect(resolveResetOffset({ kind: 'timestamp', timestamp: 1 }, bounds, '5')).toBe('5');
    expect(resolveResetOffset({ kind: 'timestamp', timestamp: 1 }, bounds, '-1')).toBe('9');
  });
});

describe('topic creation validation', () => {
  const valid = { name: 'orders.v1', partitions: '3', replicationFactor: '1', configText: 'retention.ms=60000\ncleanup.policy=compact' };

  it('accepts valid input and builds the request', () => {
    expect(validateTopicCreation(valid)).toBeUndefined();
    expect(buildTopicCreation(valid)).toEqual({
      name: 'orders.v1',
      partitions: 3,
      replicationFactor: 1,
      configs: { 'retention.ms': '60000', 'cleanup.policy': 'compact' },
    });
  });

  it.each([
    [{ name: '' }, 'required'],
    [{ name: 'bad name' }, 'letters'],
    [{ name: '..' }, 'letters'],
    [{ name: 'a'.repeat(250) }, '249'],
    [{ partitions: '0' }, 'Partitions'],
    [{ partitions: '1.5' }, 'Partitions'],
    [{ replicationFactor: '0' }, 'Replication'],
    [{ configText: 'novalue' }, 'Invalid config'],
  ])('rejects %j', (override, fragment) => {
    expect(validateTopicCreation({ ...valid, ...override })).toContain(fragment);
  });

  it('parses config text ignoring blank lines', () => {
    expect(parseTopicConfigText('\n a = b \n\n')).toEqual({ configs: { a: 'b' } });
  });
});

describe('describeAdminError', () => {
  it('explains authorization failures', () => {
    expect(describeAdminError(Object.assign(new Error('x'), { type: 'TOPIC_AUTHORIZATION_FAILED' }))).toContain('Not authorized');
  });

  it('falls back to the generic description', () => {
    expect(describeAdminError(new Error('boom'))).toBe('boom');
  });
});

describe('addTopicToList', () => {
  it('appends new topics and keeps existing ones unique', () => {
    expect(addTopicToList('a, b', 'c')).toBe('a,b,c');
    expect(addTopicToList('a,b', 'a')).toBe('a,b');
    expect(addTopicToList('', 'a')).toBe('a');
  });
});
