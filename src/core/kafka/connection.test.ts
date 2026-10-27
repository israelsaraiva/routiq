import { describe, expect, it } from 'vitest';
import { buildConnectionConfig, describeKafkaError, isFatalKafkaError, parseHeadersJson, substituteProfileVariables, validateProfileForConnect, validateProfileForProduce } from './connection';
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
    expect(describeKafkaError(new Error('Connection error: ', { cause: { code: 'ECONNREFUSED' } }))).toContain('Cannot connect');
    expect(describeKafkaError(new Error('other'))).toBe('other');
  });

  it('parses header JSON', () => {
    expect(parseHeadersJson('').headers).toEqual({});
    expect(parseHeadersJson('{"a":1}').headers).toEqual({ a: '1' });
    expect(parseHeadersJson('[1]').error).toBeDefined();
    expect(parseHeadersJson('{').error).toBeDefined();
  });

  it('builds OAuth, MSK IAM and mTLS settings from secrets', () => {
    const base = { ...createKafkaProfile('p', () => 'id'), brokers: 'b-1.c.abc.kafka.eu-west-1.amazonaws.com:9098', topics: 't', ssl: true };
    expect(buildConnectionConfig({ ...base, saslMechanism: 'oauthbearer' }, { secrets: { oauthToken: 'tok' } }).sasl).toMatchObject({ mechanism: 'oauthbearer', staticToken: 'tok' });
    expect(buildConnectionConfig({ ...base, saslMechanism: 'aws-msk-iam' }, { environment: { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' } }).sasl).toMatchObject({
      mechanism: 'aws-msk-iam',
      region: 'eu-west-1',
      credentials: { accessKeyId: 'a' },
    });
    expect(buildConnectionConfig({ ...base, tlsCa: 'ca.pem', tlsCert: 'c.pem', tlsKeyPath: 'k.pem' }, { secrets: { tlsPassphrase: 'pp' } }).tls).toMatchObject({
      ca: 'ca.pem',
      passphrase: 'pp',
      rejectUnauthorized: true,
    });
    expect(buildConnectionConfig(base, undefined).tls).toBeUndefined();
  });

  it('keeps the legacy fromBeginning flag working', () => {
    expect(buildConnectionConfig({ ...profile, fromBeginning: true, startMode: undefined }, undefined)).toMatchObject({ fromBeginning: true, startPosition: { kind: 'beginning' } });
  });

  it('explains unsupported codecs and treats auth, TLS and codec errors as fatal', () => {
    expect(describeKafkaError(new Error('ZSTD compression not implemented'))).toContain('ZSTD compression');
    expect(describeKafkaError(Object.assign(new Error('Connect failed'), { code: 'ECONNREFUSED' }))).toContain('Cannot connect');
    expect(isFatalKafkaError(new Error('SASL PLAIN authentication failed'))).toBe(true);
    expect(isFatalKafkaError(new Error('self signed certificate in certificate chain'))).toBe(true);
    expect(isFatalKafkaError(new Error('Connection error: read ECONNRESET'))).toBe(false);
  });
});
