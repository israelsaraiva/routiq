import { describe, expect, it, vi } from 'vitest';
import { retryWhileTopicIsCreated } from './kafkaClient';

const unknownTopic = () => Object.assign(new Error('This server does not host this topic-partition'), { type: 'UNKNOWN_TOPIC_OR_PARTITION' });

describe('retryWhileTopicIsCreated', () => {
  it('retries while the broker reports an unknown topic', async () => {
    const operation = vi.fn().mockRejectedValueOnce(unknownTopic()).mockResolvedValueOnce(undefined);
    await retryWhileTopicIsCreated(operation, 3, 0);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt limit', async () => {
    const operation = vi.fn().mockRejectedValue(unknownTopic());
    await expect(retryWhileTopicIsCreated(operation, 3, 0)).rejects.toThrow('does not host');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(retryWhileTopicIsCreated(operation, 3, 0)).rejects.toThrow('boom');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
