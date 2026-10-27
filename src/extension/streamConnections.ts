import { TextDecoder } from 'node:util';
import { fetch } from 'undici';
import { HttpsProxyAgent } from 'https-proxy-agent';
import WebSocket from 'ws';
import { NetworkSettings } from '../core/network';
import { PreparedStream, toCookieUrl } from '../core/streamPreparation';
import { createSseParser } from '../core/sseParser';
import { GrpcCallStatus, SseEvent } from '../shared/types';
import { CookieSession, dispatcherFor, withCookieHeader } from './httpClient';

export interface StreamHandlers {
  onOpen(detail?: string): void;
  onSseEvent(event: SseEvent): void;
  onWebSocketMessage(text: string, binary: boolean, sizeBytes: number, payloadBase64?: string): void;
  onGrpcSent(text: string): void;
  onGrpcStatus(status: GrpcCallStatus): void;
  onClosed(detail: string | undefined, failed: boolean): void;
}

export interface StreamConnection {
  close(): void;
  send(text: string): boolean;
}

export interface StreamTarget {
  prepared: PreparedStream;
  network: NetworkSettings;
  timeoutMs: number;
  cookies?: CookieSession;
}

const NORMAL_CLOSE_CODE = 1000;

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: { message?: string } }).cause;
    return cause?.message ? `${error.message}: ${cause.message}` : error.message;
  }
  return String(error);
}

async function pumpSseBody(body: ReadableStream<Uint8Array>, handlers: StreamHandlers): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parser.push(decoder.decode(value, { stream: true })).forEach((event) => handlers.onSseEvent(event));
  }
  parser.push(decoder.decode()).forEach((event) => handlers.onSseEvent(event));
  parser.flush().forEach((event) => handlers.onSseEvent(event));
}

export function connectSse(target: StreamTarget, handlers: StreamHandlers): StreamConnection {
  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), target.timeoutMs);
  const run = async (): Promise<void> => {
    const response = await fetch(target.prepared.url, {
      method: 'GET',
      headers: withCookieHeader(target.prepared.headers, target.cookies?.headerFor(target.prepared.url)),
      signal: controller.signal,
      dispatcher: dispatcherFor(target.network),
    });
    clearTimeout(connectTimer);
    target.cookies?.store(target.prepared.url, response.headers.getSetCookie());
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    handlers.onOpen(`HTTP ${response.status}`);
    await pumpSseBody(response.body as unknown as ReadableStream<Uint8Array>, handlers);
    handlers.onClosed('Stream ended by server', false);
  };
  run().catch((error: unknown) => {
    clearTimeout(connectTimer);
    const aborted = controller.signal.aborted;
    handlers.onClosed(aborted ? 'Disconnected' : describeFailure(error), !aborted);
  });
  return { close: () => controller.abort(), send: () => false };
}

function toBuffer(data: WebSocket.RawData): Buffer {
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
}

function proxyAgentFor(target: StreamTarget): HttpsProxyAgent<string> | undefined {
  const { proxyUrl, rejectUnauthorized } = target.network;
  return proxyUrl ? new HttpsProxyAgent(proxyUrl, { rejectUnauthorized }) : undefined;
}

function storeUpgradeCookies(target: StreamTarget, response: { headers: Record<string, string | string[] | undefined> }): void {
  const setCookie = response.headers['set-cookie'];
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  target.cookies?.store(toCookieUrl(target.prepared.url), headers);
}

export function connectWebSocket(target: StreamTarget, handlers: StreamHandlers): StreamConnection {
  const socket = new WebSocket(target.prepared.url, target.prepared.subprotocols, {
    headers: withCookieHeader(target.prepared.headers, target.cookies?.headerFor(toCookieUrl(target.prepared.url))),
    handshakeTimeout: target.timeoutMs,
    rejectUnauthorized: target.network.rejectUnauthorized,
    agent: proxyAgentFor(target),
  });
  let failed = false;
  socket.on('upgrade', (response) => storeUpgradeCookies(target, response));
  socket.on('open', () => handlers.onOpen(socket.protocol ? `Subprotocol: ${socket.protocol}` : undefined));
  socket.on('message', (data, isBinary) => {
    const buffer = toBuffer(data);
    handlers.onWebSocketMessage(buffer.toString('utf8'), isBinary, buffer.length, isBinary ? buffer.toString('base64') : undefined);
  });
  socket.on('error', (error) => {
    failed = true;
    handlers.onClosed(describeFailure(error), true);
  });
  socket.on('close', (code, reason) => {
    if (!failed) {
      const normal = code === NORMAL_CLOSE_CODE || code === 1005;
      handlers.onClosed(`Closed (${code}${reason.length > 0 ? `: ${reason.toString()}` : ''})`, !normal);
    }
  });
  return {
    close: () => (socket.readyState === WebSocket.CONNECTING ? socket.terminate() : socket.close(NORMAL_CLOSE_CODE)),
    send: (text) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(text);
      return true;
    },
  };
}
