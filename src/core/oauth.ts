import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Auth } from '../shared/types';
import { buildQueryString, buildUrl } from './url';
import { substituteVariables } from './variables';

export interface TokenRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface OAuthToken {
  accessToken: string;
  tokenType: string;
  expiresAtMs?: number;
  refreshToken?: string;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export interface AuthorizationRedirect {
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}

export interface CodeExchange {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

export const DEFAULT_CALLBACK_PATH = '/callback';

const EXPIRY_SKEW_MS = 30_000;
const DEFAULT_TOKEN_TYPE = 'Bearer';

function field(key: string, value: string) {
  return { key, value, enabled: true };
}

function resolveAuth(auth: OAuth2Auth, values: Record<string, string>): OAuth2Auth {
  return {
    ...auth,
    tokenUrl: substituteVariables(auth.tokenUrl.trim(), values),
    clientId: substituteVariables(auth.clientId, values),
    clientSecret: substituteVariables(auth.clientSecret, values),
    scope: substituteVariables(auth.scope, values),
    username: substituteVariables(auth.username, values),
    password: substituteVariables(auth.password, values),
    authUrl: substituteVariables((auth.authUrl ?? '').trim(), values),
    redirectUrl: substituteVariables((auth.redirectUrl ?? '').trim(), values),
  };
}

function basicCredentials(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`;
}

function grantFields(auth: OAuth2Auth) {
  const fields = [field('grant_type', auth.grant)];
  if (auth.grant === 'password') {
    fields.push(field('username', auth.username), field('password', auth.password));
  }
  if (auth.scope.trim() !== '') {
    fields.push(field('scope', auth.scope.trim()));
  }
  return fields;
}

function tokenRequestFor(resolved: OAuth2Auth, fields: ReturnType<typeof field>[]): TokenRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (resolved.clientId !== '') {
    headers['Authorization'] = basicCredentials(resolved.clientId, resolved.clientSecret);
  }
  return { url: resolved.tokenUrl, headers, body: buildQueryString(fields) };
}

export function buildTokenRequest(auth: OAuth2Auth, values: Record<string, string>): TokenRequest {
  const resolved = resolveAuth(auth, values);
  return tokenRequestFor(resolved, grantFields(resolved));
}

export function generatePkcePair(entropy: Buffer = randomBytes(32)): PkcePair {
  const verifier = entropy.toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function generateState(): string {
  return randomBytes(16).toString('base64url');
}

export function buildAuthorizationUrl(auth: OAuth2Auth, values: Record<string, string>, redirect: AuthorizationRedirect): string {
  const resolved = resolveAuth(auth, values);
  if (!resolved.authUrl) {
    throw new Error('Authorization URL is empty');
  }
  const fields = [
    field('response_type', 'code'),
    field('client_id', resolved.clientId),
    field('redirect_uri', redirect.redirectUri),
    field('state', redirect.state),
  ];
  if (resolved.scope.trim() !== '') {
    fields.push(field('scope', resolved.scope.trim()));
  }
  if (redirect.codeChallenge) {
    fields.push(field('code_challenge', redirect.codeChallenge), field('code_challenge_method', 'S256'));
  }
  return buildUrl(resolved.authUrl, fields);
}

export function buildCodeExchangeRequest(auth: OAuth2Auth, values: Record<string, string>, exchange: CodeExchange): TokenRequest {
  const resolved = resolveAuth(auth, values);
  const fields = [field('grant_type', 'authorization_code'), field('code', exchange.code), field('redirect_uri', exchange.redirectUri)];
  if (exchange.codeVerifier) {
    fields.push(field('code_verifier', exchange.codeVerifier));
  }
  if (resolved.clientId !== '' && resolved.clientSecret === '') {
    fields.push(field('client_id', resolved.clientId));
  }
  return tokenRequestFor(resolved, fields);
}

export function buildRefreshRequest(auth: OAuth2Auth, values: Record<string, string>, refreshToken: string): TokenRequest {
  const resolved = resolveAuth(auth, values);
  const fields = [field('grant_type', 'refresh_token'), field('refresh_token', refreshToken)];
  if (resolved.scope.trim() !== '') {
    fields.push(field('scope', resolved.scope.trim()));
  }
  if (resolved.clientId !== '' && resolved.clientSecret === '') {
    fields.push(field('client_id', resolved.clientId));
  }
  return tokenRequestFor(resolved, fields);
}

export function tokenCacheKey(auth: OAuth2Auth, values: Record<string, string>): string {
  const { tokenUrl, clientId, clientSecret, scope, username, password, authUrl, redirectUrl } = resolveAuth(auth, values);
  return JSON.stringify([auth.grant, tokenUrl, clientId, clientSecret, scope, username, password, authUrl, redirectUrl]);
}

export function parseTokenResponse(text: string, nowMs: number): OAuthToken {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Token endpoint did not return JSON');
  }
  const record = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  if (typeof record.access_token !== 'string' || record.access_token === '') {
    const reason = typeof record.error_description === 'string' ? record.error_description : String(record.error ?? 'no access_token in response');
    throw new Error(`Token request failed: ${reason}`);
  }
  const expiresInSeconds = Number(record.expires_in);
  return {
    accessToken: record.access_token,
    tokenType: typeof record.token_type === 'string' && record.token_type !== '' ? record.token_type : DEFAULT_TOKEN_TYPE,
    expiresAtMs: Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? nowMs + expiresInSeconds * 1000 : undefined,
    refreshToken: typeof record.refresh_token === 'string' && record.refresh_token !== '' ? record.refresh_token : undefined,
  };
}

export function isTokenFresh(token: OAuthToken, nowMs: number): boolean {
  return token.expiresAtMs === undefined || token.expiresAtMs - EXPIRY_SKEW_MS > nowMs;
}

export function tokenAuthorizationValue(token: OAuthToken): string {
  const scheme = token.tokenType.toLowerCase() === 'bearer' ? DEFAULT_TOKEN_TYPE : token.tokenType;
  return `${scheme} ${token.accessToken}`;
}
