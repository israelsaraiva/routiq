import { ClientRequest, IncomingMessage, RequestOptions, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { ADDRESS_FALLBACK_TIMEOUT_MS, DEFAULT_CONNECT_TIMEOUT_MS } from '../core/network';
import { FetchPayload } from './requestPayload';

const SET_COOKIE = 'set-cookie';

export interface TransportResponse {
  status: number;
  statusText: string;
  headers: {
    get(name: string): string | null;
    getSetCookie(): string[];
    entries(): Iterable<[string, string]>;
  };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface NodeRequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: FetchPayload['body'];
  rejectUnauthorized: boolean;
  connectTimeoutMs?: number;
  signal: AbortSignal;
}

interface EncodedBody {
  buffer?: Buffer;
  contentType?: string;
}

async function encodeBody(body: FetchPayload['body']): Promise<EncodedBody> {
  if (body === undefined) {
    return {};
  }
  if (typeof body === 'string') {
    return { buffer: Buffer.from(body, 'utf8') };
  }
  if (Buffer.isBuffer(body)) {
    return { buffer: body };
  }
  const encoded = new Response(body);
  return { buffer: Buffer.from(await encoded.arrayBuffer()), contentType: encoded.headers.get('content-type') ?? undefined };
}

function headersFor(headers: Record<string, string>, encoded: EncodedBody): Record<string, string> {
  const result = { ...headers };
  if (encoded.contentType) {
    result['Content-Type'] = encoded.contentType;
  }
  if (encoded.buffer && !Object.keys(result).some((name) => name.toLowerCase() === 'content-length')) {
    result['Content-Length'] = String(encoded.buffer.byteLength);
  }
  return result;
}

function headerValueOf(message: IncomingMessage, name: string): string | null {
  const value = message.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : (value ?? null);
}

function headerEntriesOf(message: IncomingMessage): Array<[string, string]> {
  return Object.entries(message.headers).flatMap(([name, value]): Array<[string, string]> => {
    if (value === undefined) {
      return [];
    }
    return Array.isArray(value) ? value.map((item): [string, string] => [name, item]) : [[name, value]];
  });
}

function toTransportResponse(message: IncomingMessage): TransportResponse {
  const chunks: Buffer[] = [];
  const bodyRead = new Promise<Buffer>((resolve, reject) => {
    message.on('data', (chunk: Buffer) => chunks.push(chunk));
    message.on('end', () => resolve(Buffer.concat(chunks)));
    message.on('error', reject);
    message.on('aborted', () => reject(new Error('Response aborted')));
  });
  bodyRead.catch(() => undefined);
  return {
    status: message.statusCode ?? 0,
    statusText: message.statusMessage ?? '',
    headers: {
      get: (name) => headerValueOf(message, name),
      getSetCookie: () => message.headers[SET_COOKIE] ?? [],
      entries: () => headerEntriesOf(message),
    },
    arrayBuffer: async () => {
      const buffer = await bodyRead;
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    },
  };
}

function failOnConnectTimeout(request: ClientRequest, connectTimeoutMs: number): void {
  request.once('socket', (socket) => {
    if (!socket.connecting) {
      return;
    }
    const timer = setTimeout(() => {
      const error = Object.assign(new Error('Connect Timeout Error'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
      request.destroy(error);
    }, connectTimeoutMs);
    socket.once('connect', () => clearTimeout(timer));
    socket.once('close', () => clearTimeout(timer));
  });
}

export async function sendViaNode(options: NodeRequestOptions): Promise<TransportResponse> {
  const encoded = await encodeBody(options.body);
  const send = options.url.toLowerCase().startsWith('https:') ? httpsRequest : httpRequest;
  return new Promise<TransportResponse>((resolve, reject) => {
    const request = send(
      options.url,
      {
        method: options.method,
        headers: headersFor(options.headers, encoded),
        rejectUnauthorized: options.rejectUnauthorized,
        autoSelectFamily: true,
        autoSelectFamilyAttemptTimeout: ADDRESS_FALLBACK_TIMEOUT_MS,
        signal: options.signal,
      } as RequestOptions,
      (message) => resolve(toTransportResponse(message)),
    );
    failOnConnectTimeout(request, options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS);
    request.on('error', reject);
    request.end(encoded.buffer);
  });
}
