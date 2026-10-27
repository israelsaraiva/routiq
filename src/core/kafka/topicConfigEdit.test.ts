import { describe, expect, it } from 'vitest';
import { KafkaTopicConfigEntry } from '../../shared/kafkaAdminTypes';
import { describeConfigChanges, diffConfigChanges, formatBrokerVersion, isEditableConfig, planConfigUpdate, validatePartitionIncrease } from './topicConfigEdit';

const entry = (name: string, value: string | null, overrides: Partial<KafkaTopicConfigEntry> = {}): KafkaTopicConfigEntry => ({
  name,
  value,
  isDefault: false,
  readOnly: false,
  sensitive: false,
  ...overrides,
});

const current = [entry('retention.ms', '1000'), entry('cleanup.policy', 'delete', { isDefault: true }), entry('max.message.bytes', '2000')];

describe('planConfigUpdate', () => {
  it('keeps existing overrides because the broker resets everything that is not sent', () => {
    expect(planConfigUpdate(current, { 'cleanup.policy': 'compact' }).entries).toEqual([
      { name: 'retention.ms', value: '1000' },
      { name: 'max.message.bytes', value: '2000' },
      { name: 'cleanup.policy', value: 'compact' },
    ]);
  });

  it('drops an override that is reset to its default', () => {
    expect(planConfigUpdate(current, { 'retention.ms': null }).entries).toEqual([{ name: 'max.message.bytes', value: '2000' }]);
  });

  it('refuses read-only and sensitive configs and unsafe hidden overrides', () => {
    expect(planConfigUpdate([entry('x', '1', { readOnly: true })], { x: '2' }).error).toMatch(/read-only/);
    expect(planConfigUpdate([entry('x', null, { sensitive: true })], { x: '2' }).error).toMatch(/sensitive/);
    expect(planConfigUpdate([entry('secret', null, { sensitive: true }), entry('a', '1')], { a: '2' }).error).toMatch(/would be reset/);
  });
});

describe('diffConfigChanges', () => {
  it('reports only real changes, trims values and ignores locked or unknown configs', () => {
    const configs = [...current, entry('locked', '1', { readOnly: true })];
    expect(diffConfigChanges(configs, { 'retention.ms': ' 1000 ', 'max.message.bytes': '3000', locked: '2', unknown: '1' })).toEqual({ 'max.message.bytes': '3000' });
  });

  it('resets only configs that are overridden', () => {
    expect(diffConfigChanges(current, { 'retention.ms': null, 'cleanup.policy': null })).toEqual({ 'retention.ms': null });
  });
});

describe('describeConfigChanges and isEditableConfig', () => {
  it('summarises changes for the confirm dialog', () => {
    expect(describeConfigChanges({ 'retention.ms': '5', 'cleanup.policy': null })).toBe('retention.ms = 5, cleanup.policy → default');
    expect(isEditableConfig(entry('a', '1', { sensitive: true }))).toBe(false);
  });
});

describe('validatePartitionIncrease', () => {
  it('only allows growing to a whole number within the limit', () => {
    expect(validatePartitionIncrease(3, 6)).toBeUndefined();
    expect(validatePartitionIncrease(3, 3)).toMatch(/greater than 3/);
    expect(validatePartitionIncrease(3, 4.5)).toMatch(/whole number/);
    expect(validatePartitionIncrease(3, 1_000_000)).toMatch(/at most/);
  });
});

describe('formatBrokerVersion', () => {
  it('prefers the inter broker protocol version and falls back to the message format version', () => {
    expect(formatBrokerVersion([{ name: 'log.message.format.version', value: '3.0' }, { name: 'inter.broker.protocol.version', value: '3.7-IV4' }])).toBe(
      'inter.broker.protocol.version: 3.7-IV4',
    );
    expect(formatBrokerVersion([{ name: 'log.message.format.version', value: '2.8' }])).toBe('log.message.format.version: 2.8');
    expect(formatBrokerVersion([{ name: 'inter.broker.protocol.version', value: '' }])).toBeUndefined();
  });
});
