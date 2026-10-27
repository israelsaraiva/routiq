import type { KafkaMessage } from './types';

export type KafkaStartMode = 'latest' | 'beginning' | 'offset' | 'timestamp' | 'lastN';

export type KafkaAuthPreset = 'custom' | 'confluent-cloud' | 'aws-msk-iam' | 'oauth' | 'mtls';

export type KafkaSecretName = 'oauthToken' | 'oauthClientSecret' | 'awsSecretAccessKey' | 'awsSessionToken' | 'tlsKeyPem' | 'tlsPassphrase';

export type KafkaSecretValues = Partial<Record<KafkaSecretName, string>>;

export interface KafkaEngineProfileFields {
  startMode?: KafkaStartMode;
  startOffsets?: string;
  startTimestamp?: string;
  startLastN?: number;
  authPreset?: KafkaAuthPreset;
  oauthTokenUrl?: string;
  oauthClientId?: string;
  oauthScope?: string;
  awsRegion?: string;
  awsAccessKeyId?: string;
  tlsCa?: string;
  tlsCert?: string;
  tlsKeyPath?: string;
  tlsRejectUnauthorized?: boolean;
}

export interface KafkaEngineDraftFields {
  secrets?: KafkaSecretValues;
}

export interface KafkaEngineViewFields {
  storedSecrets?: KafkaSecretName[];
}

export interface KafkaEngineMessageFields {
  receivedAt?: number;
  valueTruncated?: boolean;
  valueSize?: number;
}

export type KafkaEngineHostMessage = { type: 'kafkaFullMessage'; message: KafkaMessage };

export type KafkaEngineWebviewMessage = { type: 'kafkaRequestFullMessage'; messageId: string };
