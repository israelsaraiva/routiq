import { describe, expect, it } from 'vitest';
import { awsCredentialsFromEnvironment } from './awsEnvironment';
import { buildMskIamToken } from './mskIamToken';
import { buildStringToSign, canonicalQueryString, computeSignature, deriveSigningKey, sha256Hex } from './sigv4';

const SECRET = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';

describe('sigv4', () => {
  it('derives the documented signing key', () => {
    expect(deriveSigningKey(SECRET, { date: '20150830', region: 'us-east-1', service: 'iam' }).toString('hex')).toBe(
      'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9',
    );
  });

  it('reproduces the AWS get-vanilla test-suite signature', () => {
    const scope = { date: '20150830', region: 'us-east-1', service: 'service' };
    const canonicalRequest = ['GET', '/', '', 'host:example.amazonaws.com\nx-amz-date:20150830T123600Z\n', 'host;x-amz-date', sha256Hex('')].join('\n');
    const stringToSign = buildStringToSign('20150830T123600Z', scope, canonicalRequest);
    expect(computeSignature(SECRET, scope, stringToSign)).toBe('5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });

  it('sorts and encodes query parameters', () => {
    expect(canonicalQueryString({ b: 'a b', a: '/' })).toBe('a=%2F&b=a%20b');
  });
});

describe('MSK IAM token', () => {
  const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: SECRET, sessionToken: 'tok' };
  const now = new Date('2015-08-30T12:36:00Z');

  it('is a deterministic base64url presigned kafka-cluster URL', () => {
    const { value, expiresAtMs } = buildMskIamToken({ region: 'eu-west-1', credentials, now });
    expect(value).not.toMatch(/[+/=]/);
    const url = new URL(Buffer.from(value, 'base64url').toString('utf8'));
    expect(url.host).toBe('kafka.eu-west-1.amazonaws.com');
    expect(url.searchParams.get('Action')).toBe('kafka-cluster:Connect');
    expect(url.searchParams.get('X-Amz-Credential')).toBe('AKIDEXAMPLE/20150830/eu-west-1/kafka-cluster/aws4_request');
    expect(url.searchParams.get('X-Amz-Security-Token')).toBe('tok');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAtMs).toBe(now.getTime() + 900_000);
    expect(buildMskIamToken({ region: 'eu-west-1', credentials, now }).value).toBe(value);
  });

  it('reads credentials from the environment', () => {
    expect(awsCredentialsFromEnvironment({ AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' })).toEqual({ accessKeyId: 'a', secretAccessKey: 'b', sessionToken: undefined });
    expect(awsCredentialsFromEnvironment({})).toBeUndefined();
  });
});
