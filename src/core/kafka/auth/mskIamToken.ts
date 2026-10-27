import { AwsCredentials, SIGNING_ALGORITHM, amzDateOf, awsUriEncode, buildStringToSign, canonicalQueryString, computeSignature, credentialScope, sha256Hex } from './sigv4';

export interface MskIamTokenInput {
  region: string;
  credentials: AwsCredentials;
  now: Date;
  expiresInSeconds?: number;
}

export interface MskIamToken {
  value: string;
  expiresAtMs: number;
}

const SERVICE = 'kafka-cluster';
const ACTION = 'kafka-cluster:Connect';
const DEFAULT_EXPIRY_SECONDS = 900;
const USER_AGENT = 'routiq-msk-iam';
const EMPTY_PAYLOAD_HASH = sha256Hex('');

function base64Url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signedParameters(input: MskIamTokenInput, host: string): Record<string, string> {
  const { credentials, now, region } = input;
  const amzDate = amzDateOf(now);
  const scope = { date: amzDate.slice(0, 8), region, service: SERVICE };
  const parameters: Record<string, string> = {
    Action: ACTION,
    'X-Amz-Algorithm': SIGNING_ALGORITHM,
    'X-Amz-Credential': `${credentials.accessKeyId}/${credentialScope(scope)}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS),
    'X-Amz-SignedHeaders': 'host',
  };
  credentials.sessionToken && (parameters['X-Amz-Security-Token'] = credentials.sessionToken);
  const canonicalRequest = ['GET', '/', canonicalQueryString(parameters), `host:${host}\n`, 'host', EMPTY_PAYLOAD_HASH].join('\n');
  parameters['X-Amz-Signature'] = computeSignature(credentials.secretAccessKey, scope, buildStringToSign(amzDate, scope, canonicalRequest));
  return parameters;
}

export function buildMskIamToken(input: MskIamTokenInput): MskIamToken {
  const host = `kafka.${input.region}.amazonaws.com`;
  const query = canonicalQueryString(signedParameters(input, host));
  const url = `https://${host}/?${query}&User-Agent=${awsUriEncode(USER_AGENT)}`;
  const expiresInSeconds = input.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;
  return { value: base64Url(url), expiresAtMs: input.now.getTime() + expiresInSeconds * 1000 };
}
