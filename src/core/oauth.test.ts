import { describe, expect, it } from 'vitest';
import { OAuth2Auth } from '../shared/types';
import { buildTokenRequest, isTokenFresh, parseTokenResponse, tokenAuthorizationValue, tokenCacheKey } from './oauth';

const auth: OAuth2Auth = {
  type: 'oauth2',
  grant: 'client_credentials',
  tokenUrl: '{{host}}/token',
  clientId: 'id',
  clientSecret: 's',
  scope: 'a b',
  username: '',
  password: '',
};

describe('buildTokenRequest', () => {
  it('builds a client credentials request with basic client auth', () => {
    const request = buildTokenRequest(auth, { host: 'http://h' });
    expect(request.url).toBe('http://h/token');
    expect(request.headers['Authorization']).toBe('Basic aWQ6cw==');
    expect(request.body).toBe('grant_type=client_credentials&scope=a%20b');
  });

  it('includes user credentials for the password grant', () => {
    const request = buildTokenRequest({ ...auth, grant: 'password', username: 'u', password: 'p w', scope: '' }, {});
    expect(request.body).toBe('grant_type=password&username=u&password=p%20w');
  });
});

describe('parseTokenResponse', () => {
  it('computes expiry from expires_in', () => {
    const token = parseTokenResponse('{"access_token":"t","expires_in":60}', 1000);
    expect(token).toEqual({ accessToken: 't', tokenType: 'Bearer', expiresAtMs: 61000 });
  });

  it('reports server errors', () => {
    expect(() => parseTokenResponse('{"error":"invalid_client","error_description":"bad"}', 0)).toThrow('bad');
    expect(() => parseTokenResponse('nope', 0)).toThrow('JSON');
  });
});

describe('token freshness and usage', () => {
  it('treats tokens near expiry as stale', () => {
    const token = { accessToken: 't', tokenType: 'Bearer', expiresAtMs: 100_000 };
    expect(isTokenFresh(token, 50_000)).toBe(true);
    expect(isTokenFresh(token, 80_000)).toBe(false);
    expect(isTokenFresh({ ...token, expiresAtMs: undefined }, 1e12)).toBe(true);
  });

  it('formats the authorization value', () => {
    expect(tokenAuthorizationValue({ accessToken: 't', tokenType: 'bearer' })).toBe('Bearer t');
  });

  it('varies cache key with resolved variables', () => {
    expect(tokenCacheKey(auth, { host: 'a' })).not.toBe(tokenCacheKey(auth, { host: 'b' }));
  });
});
