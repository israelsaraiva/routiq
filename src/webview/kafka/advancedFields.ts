import { KafkaProfileDraft, KafkaStatus } from '../../shared/types';

const ADVANCED_ERROR_PATTERN = /sasl|ssl|tls|certificate|authenticat|credential|password|oauth|token|aws|iam|schema registry|protobuf|\.proto/i;

const ADVANCED_TEXT_FIELDS: Array<keyof KafkaProfileDraft> = [
  'saslUsername',
  'saslPassword',
  'schemaRegistryUrl',
  'schemaRegistryUsername',
  'schemaRegistryPassword',
  'protobufFile',
  'protobufMessageType',
  'protobufTopicTypes',
  'variablesCollectionId',
  'oauthTokenUrl',
  'oauthClientId',
  'oauthScope',
  'awsRegion',
  'awsAccessKeyId',
  'tlsCa',
  'tlsCert',
  'tlsKeyPath',
];

export function usesSecuredTransport(draft: KafkaProfileDraft): boolean {
  return draft.ssl || draft.saslMechanism !== 'none';
}

export function hasAdvancedValues(draft: KafkaProfileDraft): boolean {
  const hasSecrets = Object.values(draft.secrets ?? {}).some(Boolean);
  const hasText = ADVANCED_TEXT_FIELDS.some((field) => Boolean(draft[field]));
  const hasCustomPreset = draft.authPreset !== undefined && draft.authPreset !== 'custom';
  return usesSecuredTransport(draft) || hasSecrets || hasText || hasCustomPreset || draft.readOnly === true || draft.tlsRejectUnauthorized === false;
}

export function isAdvancedError(status: KafkaStatus): boolean {
  return status.state === 'error' && ADVANCED_ERROR_PATTERN.test(status.detail ?? '');
}
