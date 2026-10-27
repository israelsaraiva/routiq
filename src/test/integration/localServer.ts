import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';

export interface LocalServer {
  baseUrl: string;
  webSocketUrl: string;
  close(): Promise<void>;
}

const SLOW_RESPONSE_DELAY_MS = 1500;

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function echo(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const body = await readBody(request);
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ method: request.method, url: request.url, headers: request.headers, body }));
}

function streamEvents(response: http.ServerResponse): void {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  response.write('event: greeting\ndata: hello\n\n');
  response.write('id: 2\ndata: line one\ndata: line two\n\n');
  response.end('data: last\n\n');
}

function route(request: http.IncomingMessage, response: http.ServerResponse): void {
  const path = (request.url ?? '/').split('?')[0];
  if (path === '/ok') {
    response.writeHead(200, { 'content-type': 'application/json', 'x-test': 'yes' });
    response.end('{"ok":true}');
  } else if (path === '/redirect') {
    response.writeHead(302, { location: '/ok' });
    response.end();
  } else if (path === '/set-cookie') {
    response.writeHead(200, { 'set-cookie': ['sid=abc123; Path=/'] });
    response.end('cookie set');
  } else if (path === '/slow') {
    setTimeout(() => response.end('late'), SLOW_RESPONSE_DELAY_MS);
  } else if (path === '/sse') {
    streamEvents(response);
  } else if (path === '/sse-forbidden') {
    response.writeHead(403, 'Forbidden');
    response.end();
  } else {
    void echo(request, response);
  }
}

function attachWebSocketEcho(server: http.Server): WebSocketServer {
  const sockets = new WebSocketServer({ server, path: '/ws', handleProtocols: (protocols) => [...protocols][0] ?? false });
  sockets.on('connection', (socket) => {
    socket.send('welcome');
    socket.on('message', (data) => socket.send(`echo:${data.toString()}`));
  });
  return sockets;
}

export async function startLocalServer(): Promise<LocalServer> {
  const server = http.createServer(route);
  const sockets = attachWebSocketEcho(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    webSocketUrl: `ws://127.0.0.1:${port}/ws`,
    close: () =>
      new Promise<void>((resolve) => {
        sockets.clients.forEach((client) => client.terminate());
        server.closeAllConnections();
        sockets.close(() => server.close(() => resolve()));
      }),
  };
}
