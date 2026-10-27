import { describe, expect, it, vi } from 'vitest';
import { RECONNECT_BACKOFF, backoffCeiling, nextBackoffDelay } from './backoff';
import { MessageBatcher } from './messageBatcher';
import { ResumePoints } from './resumePoints';
import { buildStartPosition, describeStartPosition, parseStartOffsets, parseStartTimestamp, planSeeks, resolveStartMode, validateStartPosition } from './startPosition';
import { limitMessageSize, truncateValue } from './truncation';
import { computeVirtualWindow } from './virtualWindow';
import { createKafkaProfile } from './profiles';
import { KafkaMessage } from '../../shared/types';

const watermarks = [
  { partition: 0, low: '10', high: '100' },
  { partition: 1, low: '0', high: '5' },
];

describe('backoff', () => {
  it('doubles up to the cap', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map((attempt) => backoffCeiling(attempt, RECONNECT_BACKOFF))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('applies equal jitter between half and the full ceiling', () => {
    expect(nextBackoffDelay(3, RECONNECT_BACKOFF, () => 0)).toBe(2000);
    expect(nextBackoffDelay(3, RECONNECT_BACKOFF, () => 1)).toBe(4000);
  });
});

describe('start position', () => {
  it('derives the mode from the legacy fromBeginning flag', () => {
    expect(resolveStartMode({ fromBeginning: true })).toBe('beginning');
    expect(resolveStartMode({ fromBeginning: false })).toBe('latest');
    expect(resolveStartMode({ fromBeginning: true, startMode: 'lastN' })).toBe('lastN');
  });

  it('parses the offset formats', () => {
    expect(parseStartOffsets('5, 1:7, orders:2:9').entries).toEqual([
      { topic: undefined, partition: undefined, offset: '5' },
      { topic: undefined, partition: 1, offset: '7' },
      { topic: 'orders', partition: 2, offset: '9' },
    ]);
    expect(parseStartOffsets('x').error).toContain('Invalid offset');
    expect(parseStartOffsets('').error).toBeDefined();
  });

  it('parses ISO and epoch timestamps', () => {
    expect(parseStartTimestamp('1700000000000')).toBe(1700000000000);
    expect(parseStartTimestamp('2024-05-01T10:00:00Z')).toBe(Date.parse('2024-05-01T10:00:00Z'));
    expect(parseStartTimestamp('later')).toBeUndefined();
  });

  it('validates the inputs of each mode', () => {
    const profile = createKafkaProfile('p', () => 'id');
    expect(validateStartPosition({ ...profile, startMode: 'lastN', startLastN: 0 })).toBeDefined();
    expect(validateStartPosition({ ...profile, startMode: 'timestamp', startTimestamp: 'nope' })).toBeDefined();
    expect(validateStartPosition({ ...profile, startMode: 'offset', startOffsets: '3' })).toBeUndefined();
  });

  it('plans last-N seeks clamped to the log range', () => {
    expect(planSeeks({ kind: 'lastN', count: 10 }, 't', watermarks)).toEqual([
      { topic: 't', partition: 0, offset: '90' },
      { topic: 't', partition: 1, offset: '0' },
    ]);
  });

  it('plans offsets with the most specific entry winning and clamping', () => {
    const position = buildStartPosition({ ...createKafkaProfile('p', () => 'id'), startMode: 'offset', startOffsets: '50, 1:999' });
    expect(planSeeks(position, 't', watermarks)).toEqual([
      { topic: 't', partition: 0, offset: '50' },
      { topic: 't', partition: 1, offset: '5' },
    ]);
  });

  it('plans timestamp seeks and falls back to the high watermark when no record is newer', () => {
    expect(planSeeks({ kind: 'timestamp', timestamp: 1 }, 't', watermarks, [{ partition: 0, offset: '42' }, { partition: 1, offset: '-1' }])).toEqual([
      { topic: 't', partition: 0, offset: '42' },
      { topic: 't', partition: 1, offset: '5' },
    ]);
  });

  it('describes non-trivial positions', () => {
    expect(describeStartPosition({ kind: 'lastN', count: 3 })).toBe('last 3 per partition');
    expect(describeStartPosition({ kind: 'latest' })).toBeUndefined();
  });
});

describe('ResumePoints', () => {
  it('resumes after the last delivered offset of each partition', () => {
    const points = new ResumePoints();
    points.record('t', 0, '9');
    points.record('t', 0, '10');
    points.record('t', 1, '0');
    expect(points.toSeeks()).toEqual([
      { topic: 't', partition: 0, offset: '11' },
      { topic: 't', partition: 1, offset: '1' },
    ]);
  });
});

describe('MessageBatcher', () => {
  it('flushes once per scheduled tick and bounds pending items', () => {
    let tick: () => void = () => undefined;
    const scheduler = { schedule: vi.fn((task: () => void) => void (tick = task)), cancel: vi.fn() };
    const flushed: number[][] = [];
    const batcher = new MessageBatcher<number>((batch) => flushed.push(batch), scheduler, 3);
    [1, 2, 3, 4, 5].forEach((item) => batcher.push(item));
    expect(scheduler.schedule).toHaveBeenCalledTimes(1);
    tick();
    expect(flushed).toEqual([[3, 4, 5]]);
    batcher.push(6);
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);
  });

  it('discards pending items', () => {
    const onFlush = vi.fn();
    const batcher = new MessageBatcher<number>(onFlush, { schedule: () => 1, cancel: () => undefined }, 10);
    batcher.push(1);
    batcher.discard();
    batcher.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });
});

describe('truncation', () => {
  it('leaves small values and disabled limits alone', () => {
    expect(truncateValue('abc', 100)).toEqual({ value: 'abc', truncated: false, size: 3 });
    expect(truncateValue('a'.repeat(500), 0).truncated).toBe(false);
  });

  it('cuts on a byte budget without splitting multibyte characters', () => {
    const result = truncateValue('é'.repeat(100), 51);
    expect(result.truncated).toBe(true);
    expect(result.size).toBe(200);
    expect(result.value).toBe('é'.repeat(25));
  });

  it('marks truncated messages and drops their raw payload', () => {
    const message = { id: 'm', value: 'x'.repeat(1000), valueBase64: 'abc' } as KafkaMessage;
    const limited = limitMessageSize(message, 10);
    expect(limited).toMatchObject({ value: 'x'.repeat(10), valueTruncated: true, valueSize: 1000 });
    expect(limited).not.toHaveProperty('valueBase64');
  });
});

describe('computeVirtualWindow', () => {
  const heights = Array.from({ length: 100 }, () => 10);

  it('renders only the rows in view plus overscan', () => {
    expect(computeVirtualWindow({ heights, scrollTop: 200, viewportHeight: 50, overscan: 2 })).toEqual({ start: 18, end: 27, paddingTop: 180, paddingBottom: 730, totalHeight: 1000 });
  });

  it('handles an empty list and scrolling past the end', () => {
    expect(computeVirtualWindow({ heights: [], scrollTop: 0, viewportHeight: 50, overscan: 2 }).end).toBe(0);
    expect(computeVirtualWindow({ heights, scrollTop: 99999, viewportHeight: 50, overscan: 2 }).end).toBe(100);
  });
});
