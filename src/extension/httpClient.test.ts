import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NetworkSettings } from '../core/network';
import { sendRequest } from './httpClient';

const NETWORK: NetworkSettings = { followRedirects: true, maxRedirects: 5, rejectUnauthorized: true, useVsCodeNetworking: true };

interface Captured {
  method?: string;
  contentType?: string;
  body: string;
}

let server: Server;
let baseUrl: string;
let captured: Captured;

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.url === '/redirect') {
    response.writeHead(302, { Location: '/target' }).end();
    return;
  }
  if (request.url === '/slow') {
    return;
  }
  captured = { method: request.method, contentType: request.headers['content-type'], body: await readBody(request) };
  response.writeHead(201, { 'Content-Type': 'application/json', 'Set-Cookie': ['a=1', 'b=2'] });
  response.end('{"ok":true}');
}

beforeEach(async () => {
  server = createServer((request, response) => void handle(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('sendRequest via VS Code networking', () => {
  it('sends method, headers and JSON body and returns status, body and cookies', async () => {
    const stored: string[] = [];
    const cookies = { headerFor: () => undefined, store: (_url: string, headers: string[]) => stored.push(...headers) };
    const response = await sendRequest(
      { url: `${baseUrl}/echo`, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"x"}' },
      { timeoutMs: 5000, network: NETWORK, cookies },
    );
    expect(response.error).toBeUndefined();
    expect(response.status).toBe(201);
    expect(response.body).toBe('{"ok":true}');
    expect(captured).toEqual({ method: 'POST', contentType: 'application/json', body: '{"name":"x"}' });
    expect(stored).toEqual(['a=1', 'b=2']);
    expect(response.headers.filter(([name]) => name === 'set-cookie')).toHaveLength(2);
  });

  it('follows redirects', async () => {
    const response = await sendRequest({ url: `${baseUrl}/redirect`, method: 'GET', headers: {} }, { timeoutMs: 5000, network: NETWORK });
    expect(response.status).toBe(201);
    expect(response.timing?.redirects).toBe(1);
  });

  it('reports a timeout with the routing hint', async () => {
    const response = await sendRequest({ url: `${baseUrl}/slow`, method: 'GET', headers: {} }, { timeoutMs: 100, network: NETWORK });
    expect(response.error).toContain('Request timed out after 100 ms (via VS Code networking)');
    expect(response.error).toContain('routiq.proxy');
  });

  it('reports direct routing when VS Code networking is off', async () => {
    const response = await sendRequest(
      { url: `${baseUrl}/slow`, method: 'GET', headers: {} },
      { timeoutMs: 100, network: { ...NETWORK, useVsCodeNetworking: false } },
    );
    expect(response.error).toContain('(direct connection)');
  });
});
