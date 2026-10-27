import { KafkaProfile, KafkaProfileDraft, KafkaSaslMechanism } from '../../shared/types';
import { substituteVariables } from '../variables';

export interface KafkaSaslCredentials {
  mechanism: Exclude<KafkaSaslMechanism, 'none'>;
  username: string;
  password: string;
}

export interface KafkaConnectionConfig {
  brokers: string[];
  topics: string[];
  fromBeginning: boolean;
  groupId?: string;
  ssl: boolean;
  sasl?: KafkaSaslCredentials;
}

export const DEFAULT_BROKER = 'localhost:9092';
export const LOCAL_TEST_TOPICS = 'test-topic,user-events,order-processing,payment-events,notifications';

export const SASL_MECHANISM_OPTIONS: Array<{ value: KafkaSaslMechanism; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'plain', label: 'PLAIN' },
  { value: 'scram-sha-256', label: 'SCRAM-SHA-256' },
  { value: 'scram-sha-512', label: 'SCRAM-SHA-512' },
];

function splitList(text: string): string[] {
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseBrokerList(text: string): string[] {
  return splitList(text);
}

export function parseTopicList(text: string): string[] {
  return splitList(text);
}

export function substituteProfileVariables<Profile extends KafkaProfile>(profile: Profile, variables: Record<string, string>): Profile {
  const substitute = (text: string) => substituteVariables(text, variables);
  return {
    ...profile,
    brokers: substitute(profile.brokers),
    topics: substitute(profile.topics),
    groupId: substitute(profile.groupId),
    saslUsername: substitute(profile.saslUsername),
  };
}

export function validateProfileForConnect(profile: KafkaProfile): string | undefined {
  if (parseBrokerList(profile.brokers).length === 0) {
    return 'Invalid broker configuration. Please check the broker address format.';
  }
  if (parseTopicList(profile.topics).length === 0) {
    return 'No valid topics provided. Please enter at least one topic name.';
  }
  return undefined;
}

export function validateProfileForProduce(profile: KafkaProfile, topic: string, value: string): string | undefined {
  if (parseBrokerList(profile.brokers).length === 0) {
    return 'Please provide a broker endpoint';
  }
  return topic.trim() && value ? undefined : 'Please provide broker, topic, and message value';
}

function buildSasl(profile: KafkaProfileDraft, password: string | undefined): KafkaSaslCredentials | undefined {
  if (profile.saslMechanism === 'none') {
    return undefined;
  }
  return { mechanism: profile.saslMechanism, username: profile.saslUsername, password: password ?? '' };
}

export function buildConnectionConfig(profile: KafkaProfileDraft, password: string | undefined): KafkaConnectionConfig {
  return {
    brokers: parseBrokerList(profile.brokers),
    topics: parseTopicList(profile.topics),
    fromBeginning: profile.fromBeginning,
    groupId: profile.groupId.trim() || undefined,
    ssl: profile.ssl,
    sasl: buildSasl(profile, password),
  };
}

export function describeKafkaError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ECONNREFUSED|ENOTFOUND/.test(message)) {
    return 'Cannot connect to Kafka broker. Please verify the broker address is correct and the broker is running.';
  }
  if (/timeout/i.test(message)) {
    return 'Connection timeout. The broker may be unreachable or taking too long to respond.';
  }
  return message;
}

export interface ParsedHeaders {
  headers: Record<string, string>;
  error?: string;
}

function toHeaderRecord(parsed: unknown): ParsedHeaders {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { headers: {}, error: 'Headers must be a JSON object' };
  }
  const entries = Object.entries(parsed).map(([name, value]) => [name, typeof value === 'string' ? value : String(value)]);
  return { headers: Object.fromEntries(entries) };
}

export function parseHeadersJson(text: string): ParsedHeaders {
  if (!text.trim()) {
    return { headers: {} };
  }
  try {
    return toHeaderRecord(JSON.parse(text));
  } catch {
    return { headers: {}, error: 'Headers must be valid JSON' };
  }
}
