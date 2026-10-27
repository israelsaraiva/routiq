import { KafkaAuthPreset } from '../../shared/kafkaEngineTypes';
import { KafkaProfileDraft } from '../../shared/types';

export const AUTH_PRESET_OPTIONS: Array<{ value: KafkaAuthPreset; label: string }> = [
  { value: 'custom', label: 'Custom (manual SASL / TLS)' },
  { value: 'confluent-cloud', label: 'Confluent Cloud (API key)' },
  { value: 'aws-msk-iam', label: 'AWS MSK IAM' },
  { value: 'oauth', label: 'OAuth bearer token' },
  { value: 'mtls', label: 'Mutual TLS (client certificate)' },
];

type PresetFields = Pick<KafkaProfileDraft, 'ssl' | 'saslMechanism'>;

const PRESET_FIELDS: Record<Exclude<KafkaAuthPreset, 'custom'>, PresetFields> = {
  'confluent-cloud': { ssl: true, saslMechanism: 'plain' },
  'aws-msk-iam': { ssl: true, saslMechanism: 'aws-msk-iam' },
  oauth: { ssl: true, saslMechanism: 'oauthbearer' },
  mtls: { ssl: true, saslMechanism: 'none' },
};

export function applyAuthPreset(draft: KafkaProfileDraft, preset: KafkaAuthPreset): KafkaProfileDraft {
  return preset === 'custom' ? { ...draft, authPreset: preset } : { ...draft, ...PRESET_FIELDS[preset], authPreset: preset };
}

export function usernameLabel(preset: KafkaAuthPreset | undefined): string {
  return preset === 'confluent-cloud' ? 'API key' : 'SASL username';
}

export function passwordLabel(preset: KafkaAuthPreset | undefined): string {
  return preset === 'confluent-cloud' ? 'API secret' : 'SASL password';
}

export function usesTlsClientCertificate(draft: KafkaProfileDraft): boolean {
  return draft.authPreset === 'mtls' || Boolean(draft.tlsCert || draft.tlsKeyPath);
}
