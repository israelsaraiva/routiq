import { describe, expect, it } from 'vitest';
import { Auth, RequestModel } from '../shared/types';
import { createCollection, createRequest } from './factories';
import { importPostmanCollection } from './postman';
import { buildPostmanExport } from './postmanExport';

type Entries = Array<{ key: string; value: string; type?: string }>;

function entries(values: Record<string, string>): Entries {
  return Object.entries(values).map(([key, value]) => ({ key, value, type: 'string' }));
}

function oauth2(values: Record<string, string>) {
  return { type: 'oauth2', oauth2: entries(values) };
}

function importAuthOf(auth: unknown) {
  const warnings: string[] = [];
  const collection = importPostmanCollection({ info: { name: 'C' }, item: [{ name: 'R', request: { method: 'GET', url: 'u', auth } }] }, undefined, warnings);
  return { auth: (collection.items[0] as RequestModel).auth, warnings };
}

describe('postman oauth2 auth import', () => {
  const tokenSettings = { accessTokenUrl: 'https://idp.test/token', clientId: 'cid', clientSecret: 'sec', scope: 'read write' };

  it('imports client_credentials with token url, scope and client credentials', () => {
    const { auth, warnings } = importAuthOf(oauth2({ grant_type: 'client_credentials', ...tokenSettings, addTokenTo: 'header', headerPrefix: 'Bearer', client_authentication: 'header' }));
    expect(auth).toMatchObject({ type: 'oauth2', grant: 'client_credentials', tokenUrl: 'https://idp.test/token', clientId: 'cid', clientSecret: 'sec', scope: 'read write' });
    expect(warnings).toEqual([]);
  });

  it('imports the password grant with user credentials', () => {
    const { auth } = importAuthOf(oauth2({ grant_type: 'password_credentials', ...tokenSettings, username: 'ada', password: 'pw' }));
    expect(auth).toMatchObject({ grant: 'password', username: 'ada', password: 'pw' });
  });

  it('imports authorization_code with auth url and redirect, defaulting to it when no grant is stored', () => {
    const settings = { ...tokenSettings, authUrl: 'https://idp.test/authorize', redirect_uri: 'http://localhost:9000/cb' };
    const expected = { grant: 'authorization_code', authUrl: 'https://idp.test/authorize', redirectUrl: 'http://localhost:9000/cb', usePkce: false };
    expect(importAuthOf(oauth2({ grant_type: 'authorization_code', ...settings })).auth).toMatchObject(expected);
    expect(importAuthOf(oauth2({ ...settings })).auth).toMatchObject(expected);
  });

  it('imports the PKCE variant and warns about a non-S256 challenge method', () => {
    const settings = { grant_type: 'authorization_code_with_pkce', ...tokenSettings, authUrl: 'https://idp.test/authorize' };
    expect(importAuthOf(oauth2({ ...settings, challengeAlgorithm: 'S256' }))).toMatchObject({ auth: { usePkce: true }, warnings: [] });
    expect(importAuthOf(oauth2({ ...settings, challengeAlgorithm: 'plain' })).warnings[0]).toContain('"plain" PKCE challenge method');
  });

  it('warns about unsupported grants', () => {
    const { auth, warnings } = importAuthOf(oauth2({ grant_type: 'implicit', ...tokenSettings }));
    expect(auth).toEqual({ type: 'none' });
    expect(warnings[0]).toContain('OAuth 2.0 grant "implicit" is not supported');
  });

  it('warns about query placement, custom header prefix and body client authentication', () => {
    const { auth, warnings } = importAuthOf(
      oauth2({ grant_type: 'client_credentials', ...tokenSettings, addTokenTo: 'queryParams', headerPrefix: 'Token', client_authentication: 'body' }),
    );
    expect(auth.type).toBe('oauth2');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/query string.*"Token" header prefix.*request body/);
  });

  it('reads auth stored as a plain object instead of an entry list', () => {
    const { auth } = importAuthOf({ type: 'bearer', bearer: { token: 'abc' } });
    expect(auth).toEqual({ type: 'bearer', token: 'abc' });
  });
});

describe('postman digest and unsupported auth import', () => {
  it('imports digest credentials silently when negotiated fields are empty or default', () => {
    const { auth, warnings } = importAuthOf({ type: 'digest', digest: entries({ username: 'me', password: 'pw', realm: '', nonce: '', algorithm: 'MD5', qop: '' }) });
    expect(auth).toEqual({ type: 'digest', username: 'me', password: 'pw' });
    expect(warnings).toEqual([]);
  });

  it('warns when digest realm, nonce or algorithm are customised', () => {
    const { auth, warnings } = importAuthOf({ type: 'digest', digest: entries({ username: 'me', password: 'pw', realm: 'api', algorithm: 'SHA-256', qop: 'auth' }) });
    expect(auth.type).toBe('digest');
    expect(warnings[0]).toContain('Digest realm, algorithm, qop ignored');
  });

  it('imports AWS Signature v4 settings and warns only about query-string signing', () => {
    const values = { accessKey: 'AKIA', secretKey: 's', sessionToken: 't', region: 'eu-west-1', service: 'execute-api' };
    expect(importAuthOf({ type: 'awsv4', awsv4: entries(values) })).toEqual({ auth: { type: 'awsv4', ...values }, warnings: [] });
    expect(importAuthOf({ type: 'awsv4', awsv4: entries({ ...values, addAuthDataToQuery: 'true' }) }).warnings[0]).toContain('query string');
  });

  it.each([
    ['hawk', 'Hawk', { authId: 'id', authKey: 'k' }],
    ['ntlm', 'NTLM', { username: 'u', password: 'p' }],
    ['edgegrid', 'Akamai EdgeGrid', { accessToken: 't' }],
  ])('warns about %s auth instead of dropping it silently', (type, name, values) => {
    const { auth, warnings } = importAuthOf({ type, [type]: entries(values) });
    expect(auth).toEqual({ type: 'none' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`auth type "${type}" (${name}) is not supported`);
  });

  it('treats noauth as explicit no authentication without a warning', () => {
    expect(importAuthOf({ type: 'noauth' })).toEqual({ auth: { type: 'none' }, warnings: [] });
  });
});

describe('postman auth inheritance', () => {
  const bearer = (token: string) => ({ type: 'bearer', bearer: entries({ token }) });
  const request = (name: string, auth?: unknown) => ({ name, request: { method: 'GET', url: 'u', ...(auth ? { auth } : {}) } });
  const source = {
    info: { name: 'C' },
    auth: bearer('collection-token'),
    item: [
      request('Top'),
      { name: 'Admin', auth: { type: 'basic', basic: entries({ username: 'root', password: 'pw' }) }, item: [request('InAdmin'), request('Override', bearer('own')), request('Open', { type: 'noauth' })] },
      { name: 'Plain', item: [request('InPlain')] },
      { name: 'Aws', auth: { type: 'hawk', hawk: [] }, item: [request('Signed'), request('Inherit', { type: 'inherit' })] },
    ],
  };

  const warnings: string[] = [];
  const collection = importPostmanCollection(source, undefined, warnings);
  const folders = collection.items as unknown as Array<{ items: RequestModel[] }>;
  const authOf = (request: unknown): Auth => (request as RequestModel).auth;

  it('copies the collection auth onto requests without their own auth', () => {
    expect(authOf(collection.items[0])).toEqual({ type: 'bearer', token: 'collection-token' });
    expect(authOf(folders[2].items[0])).toEqual({ type: 'bearer', token: 'collection-token' });
  });

  it('prefers folder auth, request auth and explicit noauth in that order', () => {
    expect(authOf(folders[1].items[0])).toEqual({ type: 'basic', username: 'root', password: 'pw' });
    expect(authOf(folders[1].items[1])).toEqual({ type: 'bearer', token: 'own' });
    expect(authOf(folders[1].items[2])).toEqual({ type: 'none' });
  });

  it('warns once at the level that defines an unsupported auth and inherits its resolved value', () => {
    expect(authOf(folders[3].items[0])).toEqual({ type: 'none' });
    expect(authOf(folders[3].items[1])).toEqual({ type: 'none' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"folder Aws"');
  });
});

describe('postman auth export', () => {
  const base = createRequest('R', () => 'r');

  function roundTrip(auth: Auth) {
    const collection = createCollection('C', () => 'c');
    collection.items.push({ ...base, auth });
    const exported = JSON.parse(JSON.stringify(buildPostmanExport(collection)));
    const imported = importPostmanCollection(exported, () => 'n', []);
    return { exported, auth: (imported.items[0] as RequestModel).auth };
  }

  it('round-trips oauth2 client_credentials and password grants', () => {
    const clientCredentials: Auth = { type: 'oauth2', grant: 'client_credentials', tokenUrl: 'https://t', clientId: 'i', clientSecret: 's', scope: 'a', username: '', password: '' };
    const password: Auth = { ...clientCredentials, grant: 'password', username: 'u', password: 'p' };
    expect(roundTrip(clientCredentials).auth).toEqual(clientCredentials);
    expect(roundTrip(password).auth).toEqual(password);
  });

  it('exports the password grant with Postman grant name and header placement', () => {
    const { exported } = roundTrip({ type: 'oauth2', grant: 'password', tokenUrl: 't', clientId: 'i', clientSecret: 's', scope: '', username: 'u', password: 'p' });
    const values = Object.fromEntries(exported.item[0].request.auth.oauth2.map((entry: { key: string; value: string }) => [entry.key, entry.value]));
    expect(values).toMatchObject({ grant_type: 'password_credentials', addTokenTo: 'header', headerPrefix: 'Bearer', username: 'u', password: 'p' });
  });

  it('round-trips authorization_code with and without PKCE and AWS Signature v4', () => {
    const code: Auth = {
      type: 'oauth2', grant: 'authorization_code', tokenUrl: 'https://t', clientId: 'i', clientSecret: '', scope: 'a', username: '', password: '',
      authUrl: 'https://a', redirectUrl: 'http://localhost:9000/cb', usePkce: false,
    };
    const aws: Auth = { type: 'awsv4', accessKey: 'AK', secretKey: 'SK', sessionToken: 'ST', region: 'eu-west-1', service: 'execute-api' };
    expect(roundTrip(code).auth).toEqual(code);
    expect(roundTrip({ ...code, usePkce: true }).auth).toEqual({ ...code, usePkce: true });
    expect(roundTrip(aws).auth).toEqual(aws);
  });

  it('round-trips digest auth without producing warnings', () => {
    const digest: Auth = { type: 'digest', username: 'me', password: 'pw' };
    expect(roundTrip(digest).auth).toEqual(digest);
  });
});
