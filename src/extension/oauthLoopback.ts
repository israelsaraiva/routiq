import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { DEFAULT_CALLBACK_PATH } from '../core/oauth';

export interface LoopbackListener {
  redirectUri: string;
  awaitCode(timeoutMs: number): Promise<string>;
  close(): void;
}

interface LoopbackTarget {
  host: string;
  publicHost: string;
  port: number;
  path: string;
}

const LOOPBACK_HOSTS: Record<string, string> = { '127.0.0.1': '127.0.0.1', localhost: '127.0.0.1', '[::1]': '::1' };
const DEFAULT_HOST = '127.0.0.1';

function parseTarget(redirectUrl: string): LoopbackTarget {
  if (redirectUrl === '') {
    return { host: DEFAULT_HOST, publicHost: DEFAULT_HOST, port: 0, path: DEFAULT_CALLBACK_PATH };
  }
  const url = new URL(redirectUrl);
  const host = LOOPBACK_HOSTS[url.hostname];
  if (url.protocol !== 'http:' || !host) {
    throw new Error('Redirect URL must be an http loopback address (http://localhost:PORT/path or http://127.0.0.1:PORT/path)');
  }
  return { host, publicHost: url.hostname, port: Number(url.port) || 80, path: url.pathname };
}

function respond(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><title>Routiq</title><body style="font-family:sans-serif"><p>${message}</p></body>`);
}

function listen(server: Server, target: LoopbackTarget): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'EADDRINUSE' ? new Error(`Port ${target.port} is already in use; change the OAuth redirect URL`) : error),
    );
    server.listen(target.port, target.host, () => resolve((server.address() as AddressInfo).port));
  });
}

function callbackOutcome(request: IncomingMessage, target: LoopbackTarget, state: string): { status: number; message: string; code?: string; error?: string } {
  const url = new URL(request.url ?? '/', 'http://loopback');
  if (url.pathname !== target.path) {
    return { status: 404, message: 'Not found' };
  }
  if (url.searchParams.get('state') !== state) {
    return { status: 400, message: 'State mismatch. You can close this tab.', error: 'OAuth state mismatch' };
  }
  const failure = url.searchParams.get('error');
  if (failure) {
    const detail = url.searchParams.get('error_description') ?? failure;
    return { status: 400, message: 'Authorization failed. You can close this tab.', error: `Authorization failed: ${detail}` };
  }
  const code = url.searchParams.get('code');
  return code
    ? { status: 200, message: 'Authorization complete. You can close this tab and return to VS Code.', code }
    : { status: 400, message: 'Missing authorization code.', error: 'Authorization response had no code' };
}

export async function startLoopbackListener(redirectUrl: string, state: string): Promise<LoopbackListener> {
  const target = parseTarget(redirectUrl);
  let settle: { resolve: (code: string) => void; reject: (error: Error) => void } | undefined;
  const outcome = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  outcome.catch(() => undefined);
  const server = createServer((request, response) => {
    const result = callbackOutcome(request, target, state);
    respond(response, result.status, result.message);
    if (result.code) {
      settle?.resolve(result.code);
    } else if (result.error) {
      settle?.reject(new Error(result.error));
    }
  });
  const port = await listen(server, target);
  return {
    redirectUri: `http://${target.publicHost}:${port}${target.path}`,
    awaitCode(timeoutMs) {
      const timer = setTimeout(() => settle?.reject(new Error('Timed out waiting for the browser authorization')), timeoutMs);
      return outcome.finally(() => clearTimeout(timer));
    },
    close() {
      server.close();
      server.closeAllConnections();
    },
  };
}
