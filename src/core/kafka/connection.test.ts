import { describe, expect, it } from 'vitest';
import { buildConnectionConfig, describeKafkaError, parseHeadersJson, substituteProfileVariables, validateProfileForConnect, validateProfileForProduce } from './connection';
import { createKafkaProfile } from './profiles';

const profile = { ...createKafkaProfile('p', () => 'id'), brokers: ' a:9092, {{host}} ', topics: 't1, ,t2' };

describe('connection config', () => {
  it('substitutes variables and builds the config', () => {
    const resolved = substituteProfileVariables(profile, { host: 'b:9092' });
    const config = buildConnectionConfig({ ...resolved, saslMechanism: 'plain', saslUsername: 'u' }, 'pw');
    expect(config).toMatchObject({ brokers: ['a:9092', 'b:9092'], topics: ['t1', 't2'], sasl: { mechanism: 'plain', username: 'u', password: 'pw' } });
    expect(buildConnectionConfig(resolved, undefined).sasl).toBeUndefined();
  });

  it('validates brokers, topics and produce input', () => {
    expect(validateProfileForConnect({ ...profile, brokers: '' })).toContain('broker');
    expect(validateProfileForConnect({ ...profile, topics: '' })).toContain('topics');
    expect(validateProfileForConnect(profile)).toBeUndefined();
    expect(validateProfileForProduce(profile, '', 'x')).toBeDefined();
    expect(validateProfileForProduce(profile, 't', 'x')).toBeUndefined();
  });
});

describe('helpers', () => {
  it('maps common errors', () => {
    expect(describeKafkaError(new Error('connect ECONNREFUSED'))).toContain('Cannot connect');
    expect(describeKafkaError(new Error('Connection timeout'))).toContain('timeout');
    expect(describeKafkaError(new Error('other'))).toBe('other');
  });

  it('parses header JSON', () => {
    expect(parseHeadersJson('').headers).toEqual({});
    expect(parseHeadersJson('{"a":1}').headers).toEqual({ a: '1' });
    expect(parseHeadersJson('[1]').error).toBeDefined();
    expect(parseHeadersJson('{').error).toBeDefined();
  });
});
