import { KafkaProfile, KafkaProfileDraft } from '../../shared/types';
import { IdGenerator, generateId } from '../ids';
import { DEFAULT_BROKER } from './connection';
import { resolveStartMode } from './startPosition';

export function createKafkaProfile(name: string, newId: IdGenerator = generateId): KafkaProfile {
  return {
    id: newId(),
    name,
    brokers: DEFAULT_BROKER,
    topics: '',
    fromBeginning: false,
    groupId: '',
    ssl: false,
    saslMechanism: 'none',
    saslUsername: '',
    startMode: 'latest',
    authPreset: 'custom',
  };
}

export function stripPassword({ saslPassword: _saslPassword, secrets: _secrets, schemaRegistryPassword: _schemaRegistryPassword, ...profile }: KafkaProfileDraft): KafkaProfile {
  return profile;
}

export function upsertProfile(profiles: KafkaProfile[], profile: KafkaProfile): KafkaProfile[] {
  const exists = profiles.some((candidate) => candidate.id === profile.id);
  return exists ? profiles.map((candidate) => (candidate.id === profile.id ? profile : candidate)) : [...profiles, profile];
}

export function removeProfile(profiles: KafkaProfile[], profileId: string): KafkaProfile[] {
  return profiles.filter((profile) => profile.id !== profileId);
}

export function isProfileNameTaken(profiles: KafkaProfile[], name: string, ignoreId?: string): boolean {
  const wanted = name.trim().toLowerCase();
  return profiles.some((profile) => profile.id !== ignoreId && profile.name.trim().toLowerCase() === wanted);
}

export function uniqueProfileName(profiles: KafkaProfile[], baseName: string): string {
  let candidate = baseName;
  for (let suffix = 2; isProfileNameTaken(profiles, candidate); suffix++) {
    candidate = `${baseName} ${suffix}`;
  }
  return candidate;
}

export function duplicateProfile(profiles: KafkaProfile[], source: KafkaProfile, newId: IdGenerator = generateId): KafkaProfile {
  return { ...source, id: newId(), name: uniqueProfileName(profiles, `${source.name} copy`) };
}

export function validateProfileForSave(profiles: KafkaProfile[], profile: KafkaProfile): string | undefined {
  if (!profile.name.trim()) {
    return 'Please enter a name for this connection';
  }
  if (!profile.brokers.trim() || !profile.topics.trim()) {
    return 'Please provide both broker and topics before saving';
  }
  return isProfileNameTaken(profiles, profile.name, profile.id) ? 'Please choose a different name for this connection' : undefined;
}

export function saslPasswordKey(profileId: string): string {
  return `routiq.kafka.${profileId}.saslPassword`;
}

export function normalizeStoredProfiles(stored: unknown): KafkaProfile[] {
  return Array.isArray(stored) ? stored.filter(isStoredProfile).map(migrateStoredProfile) : [];
}

export function migrateStoredProfile(profile: KafkaProfile): KafkaProfile {
  const merged = { ...createKafkaProfile(profile.name, () => profile.id), ...profile };
  return { ...merged, startMode: resolveStartMode(profile), fromBeginning: resolveStartMode(profile) === 'beginning' };
}

function isStoredProfile(value: unknown): value is KafkaProfile {
  const candidate = value as Partial<KafkaProfile> | null;
  return typeof candidate?.id === 'string' && typeof candidate.name === 'string';
}
