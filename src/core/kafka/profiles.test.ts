import { describe, expect, it } from 'vitest';
import { createKafkaProfile, duplicateProfile, normalizeStoredProfiles, removeProfile, saslPasswordKey, stripPassword, uniqueProfileName, upsertProfile, validateProfileForSave } from './profiles';

const base = { ...createKafkaProfile('Local', () => 'one'), brokers: 'localhost:9092', topics: 't' };

describe('profiles', () => {
  it('upserts, removes and keeps passwords out', () => {
    const renamed = upsertProfile([base], { ...base, name: 'Renamed' });
    expect(renamed).toHaveLength(1);
    expect(removeProfile(renamed, 'one')).toEqual([]);
    expect(stripPassword({ ...base, saslPassword: 'secret' })).not.toHaveProperty('saslPassword');
  });

  it('generates unique names and duplicates', () => {
    expect(uniqueProfileName([base], 'Local')).not.toBe('Local');
    const copy = duplicateProfile([base], base, () => 'two');
    expect(copy.id).toBe('two');
    expect(copy.name).not.toBe('Local');
  });

  it('validates names and normalizes stored data', () => {
    expect(validateProfileForSave([base], { ...base, id: 'other' })).toBeDefined();
    expect(validateProfileForSave([base], base)).toBeUndefined();
    expect(normalizeStoredProfiles('nope')).toEqual([]);
    expect(normalizeStoredProfiles([base, { junk: true }])).toHaveLength(1);
    expect(saslPasswordKey('one')).toBe('routiq.kafka.one.saslPassword');
  });
});
