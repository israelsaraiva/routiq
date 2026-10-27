import { createHash } from 'node:crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signAwsRequest } from '../core/awsSigV4';
import { NetworkSettings } from '../core/network';
import { prepareRequest } from '../core/requestBuilder';
import { createRequest } from '../core/factories';
import { sendRequest } from './httpClient';

const NETWORK: NetworkSettings = { followRedirects: true, maxRedirects: 5, rejectUnauthorized: true, useVsCodeNetworking: false, connectTimeoutMs: 1000 };
const NONCE = 'dcd98b7102dd2f0e8b11d0f600bfb0c093';
const REALM = 'routiq-test';

let server: Server;
let baseUrl: string;
let seen: IncomingMessage[];
let bodies: string[];

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function digestParams(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const match of header.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) {
    params[match[1]] = match[2] ?? match[3];
  }
  return params;
}

function expectedDigestResponse(algorithm: string, params: Record<string, string>, method: string): string {
  const hash = (text: string) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'md5').update(text).digest('hex');
  const ha1 = hash(`ada:${REALM}:secret`);
  const ha2 = hash(`${method}:${params.uri}`);
  return hash(`${ha1}:${NONCE}:${params.nc}:${params.cnonce}:${params.qop}:${ha2}`);
}

function digestHandler(algorithm: string) {
  return (request: IncomingMessage, response: ServerResponse) => {
    const header = request.headers.authorization;
    if (header?.startsWith('Digest ')) {
      const params = digestParams(header);
      const valid = params.response === expectedDigestResponse(algorithm, params, request.method ?? '') && params.algorithm === algorithm && params.realm === REALM;
      response.writeHead(valid ? 200 : 403).end(valid ? 'welcome' : 'bad digest');
      return;
    }
    response.writeHead(401, { 'WWW-Authenticate': `Digest realm="${REALM}", qop="auth", algorithm=${algorithm}, nonce="${NONCE}", opaque="op"` }).end();
  };
}

async function startServer(handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>): Promise<void> {
  server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => {
  seen = [];
  bodies = [];
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('digest auth against a local server', () => {
  it.each(['MD5', 'SHA-256'])('answers a %s challenge with qop=auth', async (algorithm) => {
    await startServer(digestHandler(algorithm));
    const request = { ...createRequest('r', () => 'r'), url: `${baseUrl}/secure?x=1`, auth: { type: 'digest' as const, username: 'ada', password: 'secret' } };
    const response = await sendRequest(prepareRequest(request, {}), { timeoutMs: 3000, network: NETWORK });
    expect(response.status).toBe(200);
    expect(response.body).toBe('welcome');
  });

  it('returns the 401 when the password is wrong', async () => {
    await startServer(digestHandler('MD5'));
    const request = { ...createRequest('r', () => 'r'), url: `${baseUrl}/secure`, auth: { type: 'digest' as const, username: 'ada', password: 'nope' } };
    const response = await sendRequest(prepareRequest(request, {}), { timeoutMs: 3000, network: NETWORK });
    expect(response.status).toBe(403);
  });
});

describe('AWS Signature v4 against a local server', () => {
  const auth = { type: 'awsv4' as const, accessKey: 'AKID', secretKey: 'SECRET', sessionToken: 'TOKEN', region: 'eu-west-1', service: 'execute-api' };

  async function captureHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
    seen.push(request);
    bodies.push(await readBody(request));
    response.writeHead(200).end('ok');
  }

  it('signs method, query, headers and body hash of the outgoing request', async () => {
    await startServer(captureHandler);
    const request = {
      ...createRequest('r', () => 'r'),
      method: 'POST' as const,
      url: `${baseUrl}/items?b=2&a=1`,
      auth,
      body: { type: 'json' as const, text: '{"n":1}', form: [] },
    };
    const response = await sendRequest(prepareRequest(request, {}), { timeoutMs: 3000, network: NETWORK });
    expect(response.status).toBe(200);
    const headers = seen[0].headers;
    const signedAt = new Date(String(headers['x-amz-date']).replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));
    const expected = signAwsRequest({
      method: 'POST',
      url: `${baseUrl}/items?b=2&a=1`,
      headers: { 'content-type': 'application/json', 'user-agent': headers['user-agent']!, accept: '*/*' },
      body: '{"n":1}',
      settings: { credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET', sessionToken: 'TOKEN' }, region: 'eu-west-1', service: 'execute-api' },
      now: signedAt,
    });
    expect(headers.authorization).toBe(expected.Authorization);
    expect(headers['x-amz-security-token']).toBe('TOKEN');
    expect(bodies[0]).toBe('{"n":1}');
  });

  it('re-signs after a redirect for the new location', async () => {
    await startServer(async (request, response) => {
      if (request.url === '/old') {
        response.writeHead(302, { Location: '/new' }).end();
        return;
      }
      await captureHandler(request, response);
    });
    const request = { ...createRequest('r', () => 'r'), url: `${baseUrl}/old`, auth };
    await sendRequest(prepareRequest(request, {}), { timeoutMs: 3000, network: NETWORK });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('/new');
    expect(seen[0].headers.authorization).toContain('Credential=AKID/');
  });
});
