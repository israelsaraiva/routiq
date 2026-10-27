import { KafkaSecretName } from '../../shared/kafkaEngineTypes';

export const KAFKA_SECRET_NAMES: KafkaSecretName[] = ['oauthToken', 'oauthClientSecret', 'awsSecretAccessKey', 'awsSessionToken', 'tlsKeyPem', 'tlsPassphrase'];

export function kafkaSecretKey(profileId: string, name: KafkaSecretName): string {
  return `routiq.kafka.${profileId}.${name}`;
}
