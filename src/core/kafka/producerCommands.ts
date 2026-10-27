import { KafkaMessage, KafkaProfile } from '../../shared/types';
import { isTombstone } from './tombstone';

export interface CommandTarget {
  brokers: string;
  ssl: boolean;
  saslMechanism: KafkaProfile['saslMechanism'];
  saslUsername: string;
}

export interface BuiltCommand {
  command: string;
  warning?: string;
}

const MULTI_LINE_DELIMITER = "$'\\x1e'";
const PASSWORD_PLACEHOLDER = '<password>';

export function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function securityProtocol({ ssl, saslMechanism }: CommandTarget): string | undefined {
  if (saslMechanism === 'none') {
    return ssl ? 'SSL' : undefined;
  }
  return ssl ? 'SASL_SSL' : 'SASL_PLAINTEXT';
}

function kcatSecurityOptions(target: CommandTarget): string[] {
  const protocol = securityProtocol(target);
  const sasl =
    target.saslMechanism === 'none'
      ? []
      : [
          `sasl.mechanisms=${target.saslMechanism.toUpperCase()}`,
          `sasl.username=${target.saslUsername}`,
          `sasl.password=${PASSWORD_PLACEHOLDER}`,
        ];
  return [...(protocol ? [`security.protocol=${protocol}`] : []), ...sasl].flatMap((option) => ['-X', shellQuote(option)]);
}

function kcatWarning(message: KafkaMessage): string | undefined {
  return message.value === '' && !isTombstone(message) ? 'kcat skips empty input lines; an empty-string value cannot be produced with kcat.' : undefined;
}

export function buildKcatCommand(message: KafkaMessage, target: CommandTarget): BuiltCommand {
  const multiLine = /[\r\n]/.test(message.value);
  const headers = Object.entries(message.headers ?? {}).flatMap(([name, value]) => ['-H', shellQuote(`${name}=${value}`)]);
  const options = [
    '-P',
    '-b',
    shellQuote(target.brokers),
    '-t',
    shellQuote(message.topic),
    ...(message.key === null ? [] : ['-k', shellQuote(message.key)]),
    ...headers,
    ...kcatSecurityOptions(target),
    ...(isTombstone(message) ? ['-Z'] : []),
    ...(multiLine ? ['-D', MULTI_LINE_DELIMITER] : []),
  ];
  const input = isTombstone(message) ? "printf '\\n'" : `printf '%s' ${shellQuote(message.value)}`;
  return { command: `${input} | kcat ${options.join(' ')}`, warning: kcatWarning(message) };
}

function consoleProducerWarning(message: KafkaMessage): string | undefined {
  const hasTab = [message.key ?? '', message.value, ...Object.entries(message.headers ?? {}).flat()].some((text) => text.includes('\t'));
  if (/[\r\n]/.test(message.value)) {
    return 'kafka-console-producer sends one message per line; this multi-line value would be split. Use the kcat command instead.';
  }
  if (isTombstone(message)) {
    return 'kafka-console-producer cannot send a tombstone (null value) without extra properties; use the kcat command instead.';
  }
  return hasTab ? 'Tabs in key, value or headers break the kafka-console-producer input format.' : undefined;
}

export function buildConsoleProducerCommand(message: KafkaMessage, target: CommandTarget): BuiltCommand {
  const headerEntries = Object.entries(message.headers ?? {});
  const hasHeaders = headerEntries.length > 0;
  const hasKey = message.key !== null;
  const properties = [
    ...(hasKey ? ['parse.key=true', 'key.separator=\t'] : []),
    ...(hasHeaders ? ['parse.headers=true'] : []),
  ].flatMap((property) => ['--property', shellQuote(property)]);
  const fields = [hasHeaders ? headerEntries.map(([name, value]) => `${name}:${value}`).join(',') : undefined, message.key ?? undefined, message.value].filter(
    (field): field is string => field !== undefined,
  );
  const options = ['--bootstrap-server', shellQuote(target.brokers), '--topic', shellQuote(message.topic), ...properties];
  return { command: `printf '%s\\n' ${shellQuote(fields.join('\t'))} | kafka-console-producer.sh ${options.join(' ')}`, warning: consoleProducerWarning(message) };
}
