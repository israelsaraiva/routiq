import { createHash } from 'node:crypto';
import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OAuth2Auth } from '../shared/types';
import { configureOAuth, obtainAuthorization, obtainToken, TokenStore } from './oauthTokens';

interface TokenCall {
  params: URLSearchParams;
}

let idp: Server;
let idpUrl: string;
let tokenCalls: TokenCall[];
let issuedTokens: number;
let rejectRefresh: boolean;
let browserOpens: string[];
let secrets: Map<string, string>;

const tokenStore: TokenStore = {
  get: async (key) => secrets.get(key),
  store: async (key, value) => void secrets.set(key, value),
};

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function tokenResponse(expiresIn: number): string {
  issuedTokens += 1;
  return JSON.stringify({ access_token: `access-${issuedTokens}`, refresh_token: `refresh-${issuedTokens}`, token_type: 'bearer', expires_in: expiresIn });
}

beforeEach(async () => {
  tokenCalls = [];
  issuedTokens = 0;
  rejectRefresh = false;
  browserOpens = [];
  secrets = new Map();
  idp = createServer(async (request, response) => {
    const params = await readForm(request);
    tokenCalls.push({ params });
    if (params.get('grant_type') === 'refresh_token' && rejectRefresh) {
      response.writeHead(400).end('{"error":"invalid_grant"}');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(tokenResponse(params.get('grant_type') === 'refresh_token' ? 3600 : 1));
  });
  await new Promise<void>((resolve) => idp.listen(0, '127.0.0.1', resolve));
  idpUrl = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`;
  configureOAuth({
    tokenStore,
    openBrowser: async (url) => {
      browserOpens.push(url);
      const authorization = new URL(url);
      const redirect = new URL(authorization.searchParams.get('redirect_uri')!);
      redirect.searchParams.set('code', 'the-code');
      redirect.searchParams.set('state', authorization.searchParams.get('state')!);
      void fetch(redirect);
    },
  });
});

afterEach(async () => {
  configureOAuth(undefined);
  idp.closeAllConnections();
  await new Promise((resolve) => idp.close(resolve));
});

function codeAuth(overrides: Partial<OAuth2Auth> = {}): OAuth2Auth {
  return {
    type: 'oauth2',
    grant: 'authorization_code',
    tokenUrl: `${idpUrl}/token`,
    authUrl: `${idpUrl}/authorize`,
    redirectUrl: '',
    usePkce: true,
    clientId: 'client',
    clientSecret: '',
    scope: 'openid',
    username: '',
    password: '',
    ...overrides,
  };
}

describe('OAuth 2.0 authorization code flow', () => {
  it('opens the browser, receives the loopback redirect and exchanges the code with PKCE', async () => {
    const authorization = await obtainAuthorization(codeAuth({ clientId: 'pkce-client' }), {}, 3000);
    expect(authorization).toBe('Bearer access-1');
    const opened = new URL(browserOpens[0]);
    expect(opened.searchParams.get('code_challenge_method')).toBe('S256');
    expect(opened.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    const exchange = tokenCalls[0].params;
    expect(exchange.get('grant_type')).toBe('authorization_code');
    expect(exchange.get('code')).toBe('the-code');
    expect(exchange.get('redirect_uri')).toBe(opened.searchParams.get('redirect_uri'));
    expect(createHash('sha256').update(exchange.get('code_verifier')!).digest('base64url')).toBe(opened.searchParams.get('code_challenge'));
  });

  it('reuses the cached token and refreshes with the refresh token once it expires', async () => {
    const auth = codeAuth({ clientId: 'refresh-client' });
    await obtainToken(auth, {}, 3000);
    expect((await obtainToken(auth, {}, 3000)).accessToken).toBe('access-2');
    expect(tokenCalls.map((call) => call.params.get('grant_type'))).toEqual(['authorization_code', 'refresh_token']);
    expect(tokenCalls[1].params.get('refresh_token')).toBe('refresh-1');
    expect(browserOpens).toHaveLength(1);
    expect((await obtainToken(auth, {}, 3000)).accessToken).toBe('access-2');
    expect(tokenCalls).toHaveLength(2);
  });

  it('falls back to the browser when the refresh token is rejected', async () => {
    const auth = codeAuth({ clientId: 'rejected-client' });
    await obtainToken(auth, {}, 3000);
    rejectRefresh = true;
    await obtainToken(auth, {}, 3000);
    expect(browserOpens).toHaveLength(2);
  });

  it('persists the token in the secret store and restores it without opening the browser', async () => {
    const auth = codeAuth({ clientId: 'persisted-client', usePkce: false });
    await obtainToken(auth, {}, 3000);
    expect([...secrets.keys()][0]).toMatch(/^routiq\.oauth\.[0-9a-f]{64}$/);
    expect([...secrets.values()].join('')).not.toContain('persisted-client');
    await obtainToken(auth, {}, 3000, true);
    expect(browserOpens).toHaveLength(1);
    expect(tokenCalls[1].params.get('grant_type')).toBe('refresh_token');
  });

  it('honours a configured loopback redirect URL', async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as AddressInfo).port;
    await new Promise((resolve) => probe.close(resolve));
    await obtainToken(codeAuth({ clientId: 'fixed-port', redirectUrl: `http://localhost:${port}/oauth/cb` }), {}, 3000);
    expect(new URL(browserOpens[0]).searchParams.get('redirect_uri')).toBe(`http://localhost:${port}/oauth/cb`);
  });

  it('rejects redirect URLs that are not loopback', async () => {
    await expect(obtainToken(codeAuth({ clientId: 'remote', redirectUrl: 'https://example.com/cb' }), {}, 3000)).rejects.toThrow('loopback');
  });

  it('fails when the authorization server reports an error to the redirect', async () => {
    configureOAuth({
      openBrowser: async (url) => {
        const authorization = new URL(url);
        const redirect = new URL(authorization.searchParams.get('redirect_uri')!);
        redirect.searchParams.set('error', 'access_denied');
        redirect.searchParams.set('state', authorization.searchParams.get('state')!);
        void fetch(redirect);
      },
    });
    await expect(obtainToken(codeAuth({ clientId: 'denied' }), {}, 3000)).rejects.toThrow('access_denied');
  });

  it('ignores redirects carrying a different state', async () => {
    configureOAuth({
      openBrowser: async (url) => {
        const redirect = new URL(new URL(url).searchParams.get('redirect_uri')!);
        redirect.searchParams.set('code', 'forged');
        redirect.searchParams.set('state', 'wrong');
        void fetch(redirect);
      },
    });
    await expect(obtainToken(codeAuth({ clientId: 'forged' }), {}, 3000)).rejects.toThrow('state mismatch');
    expect(tokenCalls).toHaveLength(0);
  });
});

describe('OAuth 2.0 client credentials and password grants', () => {
  function serviceAuth(overrides: Partial<OAuth2Auth> = {}): OAuth2Auth {
    return {
      type: 'oauth2',
      grant: 'client_credentials',
      tokenUrl: `${idpUrl}/token`,
      clientId: 'service-client',
      clientSecret: 'service-secret',
      scope: 'orders.read',
      username: '',
      password: '',
      ...overrides,
    };
  }

  it('persists the token in the secret store without leaking credentials into the key', async () => {
    await obtainToken(serviceAuth({ clientId: 'persisted-service' }), {}, 3000);
    const [key] = [...secrets.keys()];
    expect(key).toMatch(/^routiq\.oauth\.[0-9a-f]{64}$/);
    expect(JSON.parse(secrets.get(key)!)).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('refreshes an expired token with its refresh token instead of repeating the grant', async () => {
    const auth = serviceAuth({ clientId: 'refreshing-service' });
    await obtainToken(auth, {}, 3000);
    expect((await obtainToken(auth, {}, 3000)).accessToken).toBe('access-2');
    expect(tokenCalls.map((call) => call.params.get('grant_type'))).toEqual(['client_credentials', 'refresh_token']);
    expect(tokenCalls[1].params.get('refresh_token')).toBe('refresh-1');
  });

  it('requests a new token when the refresh token is rejected', async () => {
    const auth = serviceAuth({ grant: 'password', clientId: 'rejected-service', username: 'ada', password: 'lovelace' });
    await obtainToken(auth, {}, 3000);
    rejectRefresh = true;
    expect((await obtainToken(auth, {}, 3000)).accessToken).toBe('access-2');
    expect(tokenCalls.map((call) => call.params.get('grant_type'))).toEqual(['password', 'refresh_token', 'password']);
  });
});
