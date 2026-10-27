import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo, connect } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NetworkSettings } from '../core/network';
import { sendRequest, withDefaultHeaders } from './httpClient';

const NETWORK: NetworkSettings = {
  followRedirects: true,
  maxRedirects: 5,
  rejectUnauthorized: true,
  useVsCodeNetworking: true,
  connectTimeoutMs: 200,
};

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

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startConnectProxy() {
  const tunnelled: string[] = [];
  const proxy = createServer();
  proxy.on('connect', (request, clientSocket, head) => {
    tunnelled.push(request.url ?? '');
    const [host, port] = (request.url ?? '').split(':');
    const upstream = connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const close = async () => {
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  };
  return { url, tunnelled, close };
}

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
    const response = await sendRequest({ url: `${baseUrl}/slow`, method: 'GET', headers: {} }, { timeoutMs: 400, network: NETWORK });
    expect(response.error).toContain('Response timeout after 400 ms (waiting for server)');
    expect(response.error).toContain('(via VS Code networking)');
    expect(response.error).toContain('routiq.connectTimeoutMs');
  });

  it('reports a closed port as a connection error, not a timeout', async () => {
    const closedPort = await freePort();
    const response = await sendRequest({ url: `http://127.0.0.1:${closedPort}/`, method: 'GET', headers: {} }, { timeoutMs: 5000, network: NETWORK });
    expect(response.error).toContain('ECONNREFUSED');
    expect(response.error).not.toMatch(/timeout after|timed out/i);
  });

  it('reaches an IPv4-only server through the localhost name', async () => {
    const port = (server.address() as AddressInfo).port;
    for (const useVsCodeNetworking of [true, false]) {
      const response = await sendRequest(
        { url: `http://localhost:${port}/redirect`, method: 'GET', headers: {} },
        { timeoutMs: 5000, network: { ...NETWORK, useVsCodeNetworking } },
      );
      expect(response.status).toBe(201);
    }
  });

  it('sends undici requests through a CONNECT proxy', async () => {
    const proxy = await startConnectProxy();
    const response = await sendRequest(
      { url: `${baseUrl}/redirect`, method: 'GET', headers: {} },
      { timeoutMs: 5000, network: { ...NETWORK, useVsCodeNetworking: false, proxyUrl: proxy.url } },
    );
    expect(response.status).toBe(201);
    expect(proxy.tunnelled.length).toBeGreaterThan(0);
    await proxy.close();
  });

  it('reports direct routing when VS Code networking is off', async () => {
    const response = await sendRequest(
      { url: `${baseUrl}/slow`, method: 'GET', headers: {} },
      { timeoutMs: 400, network: { ...NETWORK, useVsCodeNetworking: false } },
    );
    expect(response.error).toContain('Response timeout after 400 ms');
    expect(response.error).toContain('(direct connection)');
  });
});

describe('withDefaultHeaders', () => {
  it('adds User-Agent and Accept only when absent', () => {
    expect(withDefaultHeaders({ 'Content-Type': 'application/json' })).toEqual({
      'User-Agent': 'Routiq',
      Accept: '*/*',
      'Content-Type': 'application/json',
    });
    expect(withDefaultHeaders({ accept: 'text/html', 'user-agent': 'x' })).toEqual({ accept: 'text/html', 'user-agent': 'x' });
  });
});
