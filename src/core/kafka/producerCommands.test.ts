import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { CommandTarget, buildConsoleProducerCommand, buildKcatCommand, shellQuote } from './producerCommands';

const target: CommandTarget = { brokers: 'b1:9092,b2:9092', ssl: false, saslMechanism: 'none', saslUsername: '' };
const message = (overrides: Partial<KafkaMessage> = {}): KafkaMessage => ({
  id: 'i',
  flowId: 'f',
  timestamp: 1,
  topic: 'orders',
  partition: 0,
  offset: '1',
  key: 'k',
  value: '{"a":"b"}',
  headers: { h1: 'v1' },
  ...overrides,
});

describe('shellQuote', () => {
  it('wraps in single quotes and escapes embedded quotes', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(shellQuote('$HOME `x` "y"')).toBe(`'$HOME \`x\` "y"'`);
  });
});

describe('buildKcatCommand', () => {
  it('builds a producer command with key and headers', () => {
    expect(buildKcatCommand(message(), target).command).toBe(`printf '%s' '{"a":"b"}' | kcat -P -b 'b1:9092,b2:9092' -t 'orders' -k 'k' -H 'h1=v1'`);
  });

  it('quotes tricky values safely', () => {
    const { command } = buildKcatCommand(message({ key: null, headers: undefined, value: `it's $(rm -rf /)` }), target);
    expect(command).toContain(`'it'\\''s $(rm -rf /)'`);
    expect(command).not.toContain('-k');
  });

  it('uses a custom delimiter for multi-line values and -Z for tombstones', () => {
    expect(buildKcatCommand(message({ value: 'a\nb' }), target).command).toContain("-D $'\\x1e'");
    expect(buildKcatCommand(message({ value: '' }), target).command).toContain('-Z');
  });

  it('adds TLS and SASL options with a password placeholder', () => {
    const { command } = buildKcatCommand(message(), { ...target, ssl: true, saslMechanism: 'scram-sha-256', saslUsername: 'me' });
    expect(command).toContain(`-X 'security.protocol=SASL_SSL'`);
    expect(command).toContain(`-X 'sasl.mechanisms=SCRAM-SHA-256'`);
    expect(command).toContain(`-X 'sasl.password=<password>'`);
  });
});

describe('buildConsoleProducerCommand', () => {
  it('encodes headers, key and value on one tab separated line', () => {
    const { command, warning } = buildConsoleProducerCommand(message(), target);
    expect(command).toBe(
      `printf '%s\\n' 'h1:v1\tk\t{"a":"b"}' | kafka-console-producer.sh --bootstrap-server 'b1:9092,b2:9092' --topic 'orders' --property 'parse.key=true' --property 'key.separator=\t' --property 'parse.headers=true'`,
    );
    expect(warning).toBeUndefined();
  });

  it('warns about values it cannot express', () => {
    expect(buildConsoleProducerCommand(message({ value: 'a\nb' }), target).warning).toContain('multi-line');
    expect(buildConsoleProducerCommand(message({ value: '' }), target).warning).toContain('tombstone');
  });
});
