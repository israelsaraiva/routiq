import { OAuth2Auth } from '../shared/types';
import { OAuthToken, buildTokenRequest, isTokenFresh, parseTokenResponse, tokenAuthorizationValue, tokenCacheKey } from '../core/oauth';

const cachedTokens = new Map<string, OAuthToken>();

async function requestToken(auth: OAuth2Auth, values: Record<string, string>, timeoutMs: number): Promise<OAuthToken> {
  const tokenRequest = buildTokenRequest(auth, values);
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

export async function obtainToken(
  auth: OAuth2Auth,
  values: Record<string, string>,
  timeoutMs: number,
  forceRefresh = false,
): Promise<OAuthToken> {
  const key = tokenCacheKey(auth, values);
  const cached = cachedTokens.get(key);
  if (cached && !forceRefresh && isTokenFresh(cached, Date.now())) {
    return cached;
  }
  const token = await requestToken(auth, values, timeoutMs);
  cachedTokens.set(key, token);
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
