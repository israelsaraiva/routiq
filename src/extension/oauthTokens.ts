import { createHash } from 'node:crypto';
import { OAuth2Auth } from '../shared/types';
import {
  OAuthToken,
  TokenRequest,
  buildAuthorizationUrl,
  buildCodeExchangeRequest,
  buildRefreshRequest,
  buildTokenRequest,
  generatePkcePair,
  generateState,
  isTokenFresh,
  parseTokenResponse,
  tokenAuthorizationValue,
  tokenCacheKey,
} from '../core/oauth';
import { substituteVariables } from '../core/variables';
import { startLoopbackListener } from './oauthLoopback';

export interface TokenStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
}

export interface OAuthHooks {
  openBrowser(url: string): PromiseLike<unknown>;
  tokenStore?: TokenStore;
}

const BROWSER_AUTHORIZATION_TIMEOUT_MS = 300_000;
const SECRET_KEY_PREFIX = 'routiq.oauth.';

const cachedTokens = new Map<string, OAuthToken>();
const pendingBrowserFlows = new Map<string, Promise<OAuthToken>>();
let hooks: OAuthHooks | undefined;

export function configureOAuth(configured: OAuthHooks | undefined): void {
  hooks = configured;
}

function secretKeyFor(cacheKey: string): string {
  return `${SECRET_KEY_PREFIX}${createHash('sha256').update(cacheKey).digest('hex')}`;
}

async function loadPersistedToken(cacheKey: string): Promise<OAuthToken | undefined> {
  try {
    const raw = await hooks?.tokenStore?.get(secretKeyFor(cacheKey));
    return raw ? (JSON.parse(raw) as OAuthToken) : undefined;
  } catch {
    return undefined;
  }
}

async function persistToken(cacheKey: string, token: OAuthToken): Promise<void> {
  await hooks?.tokenStore?.store(secretKeyFor(cacheKey), JSON.stringify(token));
}

async function postTokenRequest(tokenRequest: TokenRequest, timeoutMs: number): Promise<OAuthToken> {
  if (tokenRequest.url === '') {
    throw new Error('Token URL is empty');
  }
  const response = await fetch(tokenRequest.url, {
    method: 'POST',
    headers: tokenRequest.headers,
    body: tokenRequest.body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return parseTokenResponse(await response.text(), Date.now());
}

async function authorizeInBrowser(auth: OAuth2Auth, values: Record<string, string>, timeoutMs: number): Promise<OAuthToken> {
  if (!hooks) {
    throw new Error('Opening the browser is not available in this context');
  }
  const state = generateState();
  const pkce = auth.usePkce ? generatePkcePair() : undefined;
  const listener = await startLoopbackListener(substituteVariables((auth.redirectUrl ?? '').trim(), values), state);
  try {
    const url = buildAuthorizationUrl(auth, values, { redirectUri: listener.redirectUri, state, codeChallenge: pkce?.challenge });
    await hooks.openBrowser(url);
    const exchange = { code: await listener.awaitCode(BROWSER_AUTHORIZATION_TIMEOUT_MS), redirectUri: listener.redirectUri, codeVerifier: pkce?.verifier };
    return await postTokenRequest(buildCodeExchangeRequest(auth, values, exchange), timeoutMs);
  } finally {
    listener.close();
  }
}

async function refreshedToken(auth: OAuth2Auth, values: Record<string, string>, previous: OAuthToken, timeoutMs: number): Promise<OAuthToken | undefined> {
  if (!previous.refreshToken) {
    return undefined;
  }
  try {
    const token = await postTokenRequest(buildRefreshRequest(auth, values, previous.refreshToken), timeoutMs);
    return { ...token, refreshToken: token.refreshToken ?? previous.refreshToken };
  } catch {
    return undefined;
  }
}

async function authorizationCodeToken(auth: OAuth2Auth, values: Record<string, string>, timeoutMs: number): Promise<OAuthToken> {
  const key = tokenCacheKey(auth, values);
  const pending = pendingBrowserFlows.get(key) ?? authorizeInBrowser(auth, values, timeoutMs).finally(() => pendingBrowserFlows.delete(key));
  pendingBrowserFlows.set(key, pending);
  return pending;
}

async function requestToken(auth: OAuth2Auth, values: Record<string, string>, timeoutMs: number, previous?: OAuthToken): Promise<OAuthToken> {
  const refreshed = previous && (await refreshedToken(auth, values, previous, timeoutMs));
  if (refreshed) {
    return refreshed;
  }
  return auth.grant === 'authorization_code'
    ? authorizationCodeToken(auth, values, timeoutMs)
    : postTokenRequest(buildTokenRequest(auth, values), timeoutMs);
}

export async function obtainToken(
  auth: OAuth2Auth,
  values: Record<string, string>,
  timeoutMs: number,
  forceRefresh = false,
): Promise<OAuthToken> {
  const key = tokenCacheKey(auth, values);
  const known = cachedTokens.get(key) ?? (await loadPersistedToken(key));
  if (known && !forceRefresh && isTokenFresh(known, Date.now())) {
    cachedTokens.set(key, known);
    return known;
  }
  const token = await requestToken(auth, values, timeoutMs, known);
  cachedTokens.set(key, token);
  await persistToken(key, token);
  return token;
}

export function cachedAuthorization(auth: OAuth2Auth, values: Record<string, string>): string | undefined {
  const cached = cachedTokens.get(tokenCacheKey(auth, values));
  return cached && isTokenFresh(cached, Date.now()) ? tokenAuthorizationValue(cached) : undefined;
}

export async function obtainAuthorization(auth: OAuth2Auth, values: Record<string, string>, timeoutMs: number): Promise<string> {
  return tokenAuthorizationValue(await obtainToken(auth, values, timeoutMs));
}

export function describeToken(token: OAuthToken): string {
  if (token.expiresAtMs === undefined) {
    return 'Token fetched (no expiry reported)';
  }
  return `Token fetched, expires ${new Date(token.expiresAtMs).toLocaleTimeString()}`;
}
