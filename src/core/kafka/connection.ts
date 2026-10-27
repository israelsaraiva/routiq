import { KafkaSecretValues } from '../../shared/kafkaEngineTypes';
import { KafkaProfile, KafkaProfileDraft, KafkaSaslMechanism } from '../../shared/types';
import { substituteVariables } from '../variables';
import { AwsCredentials } from './auth/sigv4';
import { awsCredentialsFromEnvironment, regionFromEnvironment } from './auth/awsEnvironment';
import { StartPosition, buildStartPosition, validateStartPosition } from './startPosition';

export interface KafkaSaslCredentials {
  mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
  username: string;
  password: string;
}

export interface KafkaOAuthTokenEndpoint {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

export interface KafkaOAuthBearerCredentials {
  mechanism: 'oauthbearer';
  staticToken?: string;
  tokenEndpoint?: KafkaOAuthTokenEndpoint;
}

export interface KafkaMskIamCredentials {
  mechanism: 'aws-msk-iam';
  region: string;
  credentials?: AwsCredentials;
}

export type KafkaSaslConfig = KafkaSaslCredentials | KafkaOAuthBearerCredentials | KafkaMskIamCredentials;

export interface KafkaTlsSources {
  ca?: string;
  cert?: string;
  keyPath?: string;
  keyPem?: string;
  passphrase?: string;
  rejectUnauthorized: boolean;
}

export interface KafkaConnectionConfig {
  brokers: string[];
  topics: string[];
  fromBeginning: boolean;
  startPosition?: StartPosition;
  groupId?: string;
  ssl: boolean;
  tls?: KafkaTlsSources;
  sasl?: KafkaSaslConfig;
}

export interface ConnectionSecrets {
  password?: string;
  secrets?: KafkaSecretValues;
  environment?: NodeJS.ProcessEnv;
}

export const DEFAULT_BROKER = 'localhost:9092';
export const LOCAL_TEST_TOPICS = 'test-topic,user-events,order-processing,payment-events,notifications';

export const SASL_MECHANISM_OPTIONS: Array<{ value: KafkaSaslMechanism; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'plain', label: 'PLAIN' },
  { value: 'scram-sha-256', label: 'SCRAM-SHA-256' },
  { value: 'scram-sha-512', label: 'SCRAM-SHA-512' },
  { value: 'oauthbearer', label: 'OAUTHBEARER' },
  { value: 'aws-msk-iam', label: 'AWS MSK IAM' },
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
    ...(profile.oauthTokenUrl !== undefined && { oauthTokenUrl: substitute(profile.oauthTokenUrl) }),
    ...(profile.oauthClientId !== undefined && { oauthClientId: substitute(profile.oauthClientId) }),
    ...(profile.awsRegion !== undefined && { awsRegion: substitute(profile.awsRegion) }),
    ...(profile.awsAccessKeyId !== undefined && { awsAccessKeyId: substitute(profile.awsAccessKeyId) }),
  };
}

export function validateProfileForConnect(profile: KafkaProfile): string | undefined {
  if (parseBrokerList(profile.brokers).length === 0) {
    return 'Invalid broker configuration. Please check the broker address format.';
  }
  if (parseTopicList(profile.topics).length === 0) {
    return 'No valid topics provided. Please enter at least one topic name.';
  }
  return validateStartPosition(profile);
}

export function validateProfileForProduce(profile: KafkaProfile, topic: string, value: string): string | undefined {
  if (parseBrokerList(profile.brokers).length === 0) {
    return 'Please provide a broker endpoint';
  }
  return topic.trim() && value ? undefined : 'Please provide broker, topic, and message value';
}

const MSK_REGION_PATTERN = /\.kafka(?:-serverless)?\.([a-z0-9-]+)\.amazonaws\.com/;

export function regionFromBrokers(brokers: string[]): string | undefined {
  return brokers.map((broker) => MSK_REGION_PATTERN.exec(broker)?.[1]).find(Boolean);
}

function buildOAuthBearer(profile: KafkaProfileDraft, secrets: KafkaSecretValues): KafkaOAuthBearerCredentials {
  const tokenUrl = profile.oauthTokenUrl?.trim();
  const tokenEndpoint = tokenUrl
    ? { tokenUrl, clientId: profile.oauthClientId ?? '', clientSecret: secrets.oauthClientSecret ?? '', scope: profile.oauthScope ?? '' }
    : undefined;
  return { mechanism: 'oauthbearer', staticToken: secrets.oauthToken, tokenEndpoint };
}

function buildMskIam(profile: KafkaProfileDraft, secrets: KafkaSecretValues, environment: NodeJS.ProcessEnv): KafkaMskIamCredentials {
  const accessKeyId = profile.awsAccessKeyId?.trim();
  const explicit = accessKeyId && secrets.awsSecretAccessKey ? { accessKeyId, secretAccessKey: secrets.awsSecretAccessKey, sessionToken: secrets.awsSessionToken || undefined } : undefined;
  const region = profile.awsRegion?.trim() || regionFromBrokers(parseBrokerList(profile.brokers)) || regionFromEnvironment(environment) || '';
  return { mechanism: 'aws-msk-iam', region, credentials: explicit ?? awsCredentialsFromEnvironment(environment) };
}

function buildSasl(profile: KafkaProfileDraft, { password, secrets = {}, environment = {} }: ConnectionSecrets): KafkaSaslConfig | undefined {
  switch (profile.saslMechanism) {
    case 'none':
      return undefined;
    case 'oauthbearer':
      return buildOAuthBearer(profile, secrets);
    case 'aws-msk-iam':
      return buildMskIam(profile, secrets, environment);
    default:
      return { mechanism: profile.saslMechanism, username: profile.saslUsername, password: password ?? '' };
  }
}

function hasClientTlsSettings(profile: KafkaProfileDraft, secrets: KafkaSecretValues): boolean {
  return Boolean(profile.tlsCa?.trim() || profile.tlsCert?.trim() || profile.tlsKeyPath?.trim() || secrets.tlsKeyPem);
}

function buildTls(profile: KafkaProfileDraft, secrets: KafkaSecretValues): KafkaTlsSources | undefined {
  if (!profile.ssl || (!hasClientTlsSettings(profile, secrets) && profile.tlsRejectUnauthorized !== false)) {
    return undefined;
  }
  return {
    ca: profile.tlsCa?.trim() || undefined,
    cert: profile.tlsCert?.trim() || undefined,
    keyPath: profile.tlsKeyPath?.trim() || undefined,
    keyPem: secrets.tlsKeyPem || undefined,
    passphrase: secrets.tlsPassphrase || undefined,
    rejectUnauthorized: profile.tlsRejectUnauthorized !== false,
  };
}

export function buildConnectionConfig(profile: KafkaProfileDraft, passwordOrSecrets: string | undefined | ConnectionSecrets): KafkaConnectionConfig {
  const connection: ConnectionSecrets = typeof passwordOrSecrets === 'object' ? passwordOrSecrets : { password: passwordOrSecrets };
  const startPosition = buildStartPosition(profile);
  return {
    brokers: parseBrokerList(profile.brokers),
    topics: parseTopicList(profile.topics),
    fromBeginning: startPosition.kind === 'beginning',
    startPosition,
    groupId: profile.groupId.trim() || undefined,
    ssl: profile.ssl,
    tls: buildTls(profile, connection.secrets ?? {}),
    sasl: buildSasl(profile, connection),
  };
}

function errorCode(error: unknown): string {
  const failure = error instanceof Error ? (error as Error & { code?: string; cause?: { code?: string } }) : undefined;
  return failure?.cause?.code ?? failure?.code ?? '';
}

const TLS_ERROR_PATTERN = /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT|DEPTH_ZERO_SELF_SIGNED|CERT_HAS_EXPIRED|CERT_UNTRUSTED|ERR_TLS_CERT_ALTNAME_INVALID|ERR_SSL|certificate|handshake/i;
const AUTHENTICATION_PATTERN = /SASL|authentication failed|invalid credentials/i;
const UNSUPPORTED_CODEC_PATTERN = /(\w+) compression not implemented/i;

export function describeKafkaError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostic = `${message} ${errorCode(error)}`;
  const codec = UNSUPPORTED_CODEC_PATTERN.exec(message)?.[1];
  if (codec) {
    return `The topic uses ${codec} compression, which Routiq cannot decode. Supported codecs: gzip, snappy, lz4, zstd.`;
  }
  if (/ECONNREFUSED|ENOTFOUND/.test(diagnostic)) {
    return 'Cannot connect to Kafka broker. Please verify the broker address is correct and the broker is running.';
  }
  if (TLS_ERROR_PATTERN.test(diagnostic)) {
    return `TLS error: ${message}. Check the CA certificate and client certificate in the connection, or that the broker address matches its certificate.`;
  }
  if (isAuthenticationError(error)) {
    return `Authentication failed: ${message}. Please check the credentials for this connection.`;
  }
  if (/timeout/i.test(message)) {
    return 'Connection timeout. The broker may be unreachable or taking too long to respond.';
  }
  return message;
}

export function isAuthenticationError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'KafkaJSSASLAuthenticationError' || AUTHENTICATION_PATTERN.test(message);
}

export function isFatalKafkaError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const diagnostic = `${error instanceof Error ? error.message : String(error)} ${errorCode(error)}`;
  return isAuthenticationError(error) || name === 'KafkaJSNotImplemented' || UNSUPPORTED_CODEC_PATTERN.test(diagnostic) || TLS_ERROR_PATTERN.test(diagnostic);
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
