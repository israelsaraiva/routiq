import { createHash } from 'node:crypto';

export interface DigestChallenge {
  realm: string;
  nonce: string;
  opaque?: string;
  algorithm: string;
  qopOptions: string[];
}

export interface DigestCredentials {
  username: string;
  password: string;
}

export interface DigestRequestContext {
  method: string;
  uri: string;
  cnonce: string;
  nonceCount: number;
}

const CHALLENGE_PARAM_PATTERN = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]*))/g;
const DEFAULT_ALGORITHM = 'MD5';

type HashName = 'md5' | 'sha256';

function hashNameFor(algorithm: string): HashName {
  return algorithm.toUpperCase().startsWith('SHA-256') ? 'sha256' : 'md5';
}

function isSessionAlgorithm(algorithm: string): boolean {
  return algorithm.toUpperCase().endsWith('-SESS');
}

function hashHex(hashName: HashName, value: string): string {
  return createHash(hashName).update(value, 'utf8').digest('hex');
}

function parseChallengeParams(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const match of text.matchAll(CHALLENGE_PARAM_PATTERN)) {
    params[match[1].toLowerCase()] = (match[2] ?? match[3] ?? '').replace(/\\(.)/g, '$1');
  }
  return params;
}

function splitQopOptions(qop: string | undefined): string[] {
  return (qop ?? '')
    .split(',')
    .map((option) => option.trim().toLowerCase())
    .filter((option) => option !== '');
}

function digestSegment(header: string): string | undefined {
  const match = /(?:^|,)\s*Digest\s+(.*)$/is.exec(header);
  return match?.[1];
}

export function parseDigestChallenge(headerValue: string): DigestChallenge | undefined {
  const segment = digestSegment(headerValue);
  if (segment === undefined) {
    return undefined;
  }
  const params = parseChallengeParams(segment);
  if (!params.nonce) {
    return undefined;
  }
  return {
    realm: params.realm ?? '',
    nonce: params.nonce,
    opaque: params.opaque,
    algorithm: params.algorithm ?? DEFAULT_ALGORITHM,
    qopOptions: splitQopOptions(params.qop),
  };
}

export function formatNonceCount(nonceCount: number): string {
  return nonceCount.toString(16).padStart(8, '0');
}

export function digestUriFromUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function computeHa1(challenge: DigestChallenge, credentials: DigestCredentials, cnonce: string): string {
  const hashName = hashNameFor(challenge.algorithm);
  const base = hashHex(hashName, `${credentials.username}:${challenge.realm}:${credentials.password}`);
  return isSessionAlgorithm(challenge.algorithm) ? hashHex(hashName, `${base}:${challenge.nonce}:${cnonce}`) : base;
}

function computeResponse(
  challenge: DigestChallenge,
  credentials: DigestCredentials,
  context: DigestRequestContext,
  usesQop: boolean,
): string {
  const hashName = hashNameFor(challenge.algorithm);
  const ha1 = computeHa1(challenge, credentials, context.cnonce);
  const ha2 = hashHex(hashName, `${context.method}:${context.uri}`);
  if (!usesQop) {
    return hashHex(hashName, `${ha1}:${challenge.nonce}:${ha2}`);
  }
  const nonceCount = formatNonceCount(context.nonceCount);
  return hashHex(hashName, `${ha1}:${challenge.nonce}:${nonceCount}:${context.cnonce}:auth:${ha2}`);
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function buildDigestAuthorization(
  challenge: DigestChallenge,
  credentials: DigestCredentials,
  context: DigestRequestContext,
): string {
  const usesQop = challenge.qopOptions.includes('auth');
  const fields = [
    `username=${quote(credentials.username)}`,
    `realm=${quote(challenge.realm)}`,
    `nonce=${quote(challenge.nonce)}`,
    `uri=${quote(context.uri)}`,
    `algorithm=${challenge.algorithm}`,
    `response=${quote(computeResponse(challenge, credentials, context, usesQop))}`,
  ];
  if (usesQop) {
    fields.push(`qop=auth`, `nc=${formatNonceCount(context.nonceCount)}`, `cnonce=${quote(context.cnonce)}`);
  }
  if (challenge.opaque !== undefined) {
    fields.push(`opaque=${quote(challenge.opaque)}`);
  }
  return `Digest ${fields.join(', ')}`;
}
