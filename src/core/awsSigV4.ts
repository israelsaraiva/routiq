import { AwsCredentials, SIGNING_ALGORITHM, amzDateOf, awsUriEncode, buildStringToSign, canonicalQueryFromPairs, computeSignature, credentialScope, sha256Hex } from './kafka/auth/sigv4';

export interface AwsSigningSettings {
  credentials: AwsCredentials;
  region: string;
  service: string;
}

export type SignableBody = string | Uint8Array | undefined | 'UNSIGNED-PAYLOAD';

export interface AwsSigningInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: SignableBody;
  settings: AwsSigningSettings;
  now: Date;
}

const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const AUTHORIZATION = 'authorization';
const S3_SERVICE = 's3';

function payloadHash(body: SignableBody): string {
  return body === UNSIGNED_PAYLOAD ? UNSIGNED_PAYLOAD : sha256Hex(body ?? '');
}

function canonicalPath(url: URL, service: string): string {
  const path = url.pathname === '' ? '/' : url.pathname;
  if (service === S3_SERVICE) {
    return path;
  }
  return path.replace(/\/{2,}/g, '/').split('/').map(awsUriEncode).join('/');
}

function canonicalQuery(url: URL): string {
  return canonicalQueryFromPairs([...url.searchParams.entries()]);
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function signableHeaders(headers: Record<string, string>): Array<[string, string]> {
  return Object.entries(headers)
    .filter(([name]) => name.toLowerCase() !== AUTHORIZATION)
    .map(([name, value]): [string, string] => [name.toLowerCase(), normalizeHeaderValue(value)])
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

function withoutHeaders(headers: Record<string, string>, names: string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !names.includes(name.toLowerCase())));
}

export function buildCanonicalRequest(input: { method: string; url: URL; headers: Array<[string, string]>; payloadHash: string; service: string }): string {
  const canonicalHeaders = input.headers.map(([name, value]) => `${name}:${value}\n`).join('');
  const signedHeaders = input.headers.map(([name]) => name).join(';');
  return [
    input.method.toUpperCase(),
    canonicalPath(input.url, input.service),
    canonicalQuery(input.url),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');
}

function headersToSign(input: AwsSigningInput, url: URL, amzDate: string, hash: string): Record<string, string> {
  const base = withoutHeaders(input.headers, [AUTHORIZATION, 'x-amz-date', 'x-amz-security-token', 'x-amz-content-sha256']);
  const added: Record<string, string> = { host: url.host, 'x-amz-date': amzDate };
  if (input.settings.credentials.sessionToken) {
    added['x-amz-security-token'] = input.settings.credentials.sessionToken;
  }
  if (input.settings.service === S3_SERVICE) {
    added['x-amz-content-sha256'] = hash;
  }
  return { ...withoutHeaders(base, ['host']), ...added };
}

export function signAwsRequest(input: AwsSigningInput): Record<string, string> {
  const url = new URL(input.url);
  const amzDate = amzDateOf(input.now);
  const scope = { date: amzDate.slice(0, 8), region: input.settings.region, service: input.settings.service };
  const hash = payloadHash(input.body);
  const toSign = headersToSign(input, url, amzDate, hash);
  const headers = signableHeaders(toSign);
  const canonicalRequest = buildCanonicalRequest({ method: input.method, url, headers, payloadHash: hash, service: scope.service });
  const signature = computeSignature(input.settings.credentials.secretAccessKey, scope, buildStringToSign(amzDate, scope, canonicalRequest));
  const authorization = [
    `${SIGNING_ALGORITHM} Credential=${input.settings.credentials.accessKeyId}/${credentialScope(scope)}`,
    `SignedHeaders=${headers.map(([name]) => name).join(';')}`,
    `Signature=${signature}`,
  ].join(', ');
  return { ...withoutHeaders(input.headers, [AUTHORIZATION, 'host']), ...withoutHeaders(toSign, ['host']), Authorization: authorization };
}
