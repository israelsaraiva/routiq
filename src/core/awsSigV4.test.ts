import { describe, expect, it } from 'vitest';
import { AwsSigningSettings, signAwsRequest } from './awsSigV4';

const SETTINGS: AwsSigningSettings = {
  credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' },
  region: 'us-east-1',
  service: 'service',
};
const NOW = new Date('2015-08-30T12:36:00Z');

interface Vector {
  name: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  signedHeaders: string;
  signature: string;
}

const VECTORS: Vector[] = [
  { name: 'get-vanilla', method: 'GET', path: '/', signedHeaders: 'host;x-amz-date', signature: '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31' },
  {
    name: 'get-vanilla-query-order-key-case',
    method: 'GET',
    path: '/?Param2=value2&Param1=value1',
    signedHeaders: 'host;x-amz-date',
    signature: 'b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500',
  },
  {
    name: 'get-vanilla-query-order-value',
    method: 'GET',
    path: '/?Param1=value2&Param1=value1',
    signedHeaders: 'host;x-amz-date',
    signature: '5772eed61e12b33fae39ee5e7012498b51d56abc0abb7c60486157bd471c4694',
  },
  {
    name: 'get-vanilla-query-unreserved',
    method: 'GET',
    path: '/?-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz=-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    signedHeaders: 'host;x-amz-date',
    signature: '9c3e54bfcdf0b19771a7f523ee5669cdf59bc7cc0884027167c21bb143a40197',
  },
  {
    name: 'get-relative-relative',
    method: 'GET',
    path: '/example1/example2/../..',
    signedHeaders: 'host;x-amz-date',
    signature: '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  },
  { name: 'get-slash-dot-slash', method: 'GET', path: '/./', signedHeaders: 'host;x-amz-date', signature: '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31' },
  { name: 'get-slash-pointless-dot', method: 'GET', path: '/./example', signedHeaders: 'host;x-amz-date', signature: 'ef75d96142cf21edca26f06005da7988e4f8dc83a165a80865db7089db637ec5' },
  { name: 'get-slashes', method: 'GET', path: '//example//', signedHeaders: 'host;x-amz-date', signature: '9a624bd73a37c9a373b5312afbebe7a714a789de108f0bdfe846570885f57e84' },
  { name: 'get-slash', method: 'GET', path: '//', signedHeaders: 'host;x-amz-date', signature: '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31' },
  { name: 'post-vanilla', method: 'POST', path: '/', signedHeaders: 'host;x-amz-date', signature: '5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b' },
  {
    name: 'post-x-www-form-urlencoded',
    method: 'POST',
    path: '/',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'Param1=value1',
    signedHeaders: 'content-type;host;x-amz-date',
    signature: 'ff11897932ad3f4e8b18135d722051e5ac45fc38421b1da7b9d196a0fe09473a',
  },
];

function sign(vector: Vector, settings = SETTINGS): Record<string, string> {
  return signAwsRequest({
    method: vector.method,
    url: `http://example.amazonaws.com${vector.path}`,
    headers: vector.headers ?? {},
    body: vector.body,
    settings,
    now: NOW,
  });
}

function expectedAuthorization({ signedHeaders, signature }: Vector): string {
  return `AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

describe('signAwsRequest against the AWS SigV4 test suite', () => {
  it.each(VECTORS)('$name', (vector) => {
    const headers = sign(vector);
    expect(headers.Authorization).toBe(expectedAuthorization(vector));
    expect(headers['x-amz-date']).toBe('20150830T123600Z');
  });
});

describe('signAwsRequest options', () => {
  const vanilla = VECTORS[0];

  it('signs and sends the session token', () => {
    const headers = sign(vanilla, { ...SETTINGS, credentials: { ...SETTINGS.credentials, sessionToken: 'TOKEN' } });
    expect(headers['x-amz-security-token']).toBe('TOKEN');
    expect(headers.Authorization).toContain('SignedHeaders=host;x-amz-date;x-amz-security-token');
  });

  it('adds the payload hash header for s3 and leaves path encoding single', () => {
    const headers = sign({ ...vanilla, path: '/a b' }, { ...SETTINGS, service: 's3' });
    expect(headers['x-amz-content-sha256']).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(headers.Authorization).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date');
  });

  it('replaces a stale signature and keeps other headers', () => {
    const headers = sign({ ...vanilla, headers: { authorization: 'old', 'X-Custom': 'a   b' } });
    expect(headers.Authorization).not.toBe('old');
    expect(headers.authorization).toBeUndefined();
    expect(headers.Authorization).toContain('SignedHeaders=host;x-amz-date;x-custom');
  });

  it('hashes binary and unsigned payloads', () => {
    const binary = signAwsRequest({ method: 'PUT', url: 'https://h.example.com/', headers: {}, body: new Uint8Array([1, 2, 3]), settings: { ...SETTINGS, service: 's3' }, now: NOW });
    const unsigned = signAwsRequest({ method: 'PUT', url: 'https://h.example.com/', headers: {}, body: 'UNSIGNED-PAYLOAD', settings: { ...SETTINGS, service: 's3' }, now: NOW });
    expect(binary['x-amz-content-sha256']).toBe('039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
    expect(unsigned['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
  });
});
