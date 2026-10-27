import { describe, expect, it } from 'vitest';
import { toOwnAuth } from './jsonValues';

describe('toOwnAuth', () => {
  it('round-trips the new auth types and defaults missing fields', () => {
    expect(toOwnAuth({ type: 'apikey', key: 'k', value: 'v', location: 'query' })).toEqual({ type: 'apikey', key: 'k', value: 'v', location: 'query' });
    expect(toOwnAuth({ type: 'apikey', key: 'k' })).toEqual({ type: 'apikey', key: 'k', value: '', location: 'header' });
    expect(toOwnAuth({ type: 'digest', username: 'u' })).toEqual({ type: 'digest', username: 'u', password: '' });
    expect(toOwnAuth({ type: 'oauth2', grant: 'password', tokenUrl: 't' })).toMatchObject({ type: 'oauth2', grant: 'password', tokenUrl: 't', clientSecret: '' });
  });

  it('falls back to none for unknown or legacy-missing auth', () => {
    expect(toOwnAuth(undefined)).toEqual({ type: 'none' });
    expect(toOwnAuth({ type: 'weird' })).toEqual({ type: 'none' });
  });
});
