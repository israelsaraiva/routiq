import { describe, expect, it } from 'vitest';
import { OAuth2Auth } from '../shared/types';
import { buildAuthorizationUrl, buildCodeExchangeRequest, buildRefreshRequest, generatePkcePair, buildTokenRequest, isTokenFresh, parseTokenResponse, tokenAuthorizationValue, tokenCacheKey } from './oauth';

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

describe('authorization code helpers', () => {
  const codeAuth: OAuth2Auth = { ...auth, grant: 'authorization_code', authUrl: '{{host}}/authorize?audience=api', redirectUrl: '', clientSecret: '', usePkce: true };

  it('derives an S256 challenge from the verifier', () => {
    const { verifier, challenge } = generatePkcePair(Buffer.from('a'.repeat(32)));
    expect(verifier).toBe('YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE');
    expect(challenge).toBe(generatePkcePair(Buffer.from('a'.repeat(32))).challenge);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('builds the authorization url keeping existing query parameters', () => {
    const url = new URL(buildAuthorizationUrl(codeAuth, { host: 'http://idp' }, { redirectUri: 'http://127.0.0.1:1/callback', state: 's1', codeChallenge: 'ch' }));
    expect(`${url.origin}${url.pathname}`).toBe('http://idp/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      audience: 'api',
      response_type: 'code',
      client_id: 'id',
      redirect_uri: 'http://127.0.0.1:1/callback',
      state: 's1',
      scope: 'a b',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
    });
  });

  it('rejects an empty authorization url', () => {
    expect(() => buildAuthorizationUrl({ ...codeAuth, authUrl: '' }, {}, { redirectUri: 'r', state: 's' })).toThrow('Authorization URL is empty');
  });

  it('exchanges the code with the verifier and sends public clients by id', () => {
    const request = buildCodeExchangeRequest(codeAuth, { host: 'http://idp' }, { code: 'c', redirectUri: 'http://r', codeVerifier: 'v' });
    expect(request.body).toBe('grant_type=authorization_code&code=c&redirect_uri=http%3A%2F%2Fr&code_verifier=v&client_id=id');
    expect(request.headers['Authorization']).toBe('Basic aWQ6');
  });

  it('builds a refresh request and parses the refresh token', () => {
    expect(buildRefreshRequest(codeAuth, {}, 'rt').body).toBe('grant_type=refresh_token&refresh_token=rt&scope=a%20b&client_id=id');
    expect(parseTokenResponse('{"access_token":"t","refresh_token":"rt"}', 0).refreshToken).toBe('rt');
  });
});
