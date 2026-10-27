import { createHash, createHmac } from 'node:crypto';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SigningScope {
  date: string;
  region: string;
  service: string;
}

export const SIGNING_ALGORITHM = 'AWS4-HMAC-SHA256';
const TERMINATOR = 'aws4_request';

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function deriveSigningKey(secretAccessKey: string, { date, region, service }: SigningScope): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, date);
  return hmac(hmac(hmac(dateKey, region), service), TERMINATOR);
}

export function credentialScope({ date, region, service }: SigningScope): string {
  return `${date}/${region}/${service}/${TERMINATOR}`;
}

export function buildStringToSign(amzDate: string, scope: SigningScope, canonicalRequest: string): string {
  return [SIGNING_ALGORITHM, amzDate, credentialScope(scope), sha256Hex(canonicalRequest)].join('\n');
}

export function computeSignature(secretAccessKey: string, scope: SigningScope, stringToSign: string): string {
  return createHmac('sha256', deriveSigningKey(secretAccessKey, scope)).update(stringToSign, 'utf8').digest('hex');
}

export function awsUriEncode(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function compareCanonicalPairs([leftName, leftValue]: readonly [string, string], [rightName, rightValue]: readonly [string, string]): number {
  if (leftName !== rightName) {
    return leftName < rightName ? -1 : 1;
  }
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function canonicalQueryFromPairs(pairs: ReadonlyArray<readonly [string, string]>): string {
  return pairs
    .map(([name, value]) => [awsUriEncode(name), awsUriEncode(value)] as const)
    .sort(compareCanonicalPairs)
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

export function canonicalQueryString(parameters: Record<string, string>): string {
  return canonicalQueryFromPairs(Object.entries(parameters));
}

export function amzDateOf(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
