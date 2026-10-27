import { randomBytes } from 'node:crypto';
import { Agent, Dispatcher, ProxyAgent, fetch } from 'undici';
import { buildDigestAuthorization, digestUriFromUrl, parseDigestChallenge } from '../core/digest';
import { NetworkSettings } from '../core/network';
import { PreparedRequest } from '../core/requestBuilder';
import { resolveRedirect } from '../core/redirects';
import { ResponseModel, ResponseTiming } from '../shared/types';
import { buildPayload } from './requestPayload';

type UndiciResponse = Awaited<ReturnType<typeof fetch>>;

export interface CookieSession {
  headerFor(url: string): string | undefined;
  store(url: string, setCookieHeaders: string[]): void;
}

export interface SendOptions {
  timeoutMs: number;
  network: NetworkSettings;
  cookies?: CookieSession;
  signal?: AbortSignal;
}

interface FinalHop {
  response: UndiciResponse;
  redirects: number;
  headersReceivedAt: number;
}

export const REQUEST_ABORTED_MESSAGE = 'Request aborted';

const dispatchers = new Map<string, Dispatcher>();

export function dispatcherFor(network: NetworkSettings): Dispatcher {
  const key = `${network.proxyUrl ?? ''}|${network.rejectUnauthorized}`;
  const cached = dispatchers.get(key);
  if (cached) {
    return cached;
  }
  const tls = { rejectUnauthorized: network.rejectUnauthorized };
  const created = network.proxyUrl
    ? new ProxyAgent({ uri: network.proxyUrl, requestTls: tls, proxyTls: tls })
    : new Agent({ connect: tls });
  dispatchers.set(key, created);
  return created;
}

function errorResponse(message: string, timeMs: number): ResponseModel {
  return { status: 0, statusText: '', timeMs, sizeBytes: 0, headers: [], body: '', error: message };
}

function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return `Request timed out after ${timeoutMs} ms`;
  }
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: { message?: string } }).cause;
    return cause?.message ? `${error.message}: ${cause.message}` : error.message;
  }
  return String(error);
}

export function withCookieHeader(headers: Record<string, string>, cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return headers;
  }
  const existingName = Object.keys(headers).find((name) => name.toLowerCase() === 'cookie');
  const existing = existingName ? headers[existingName] : undefined;
  return { ...headers, [existingName ?? 'Cookie']: existing ? `${existing}; ${cookieHeader}` : cookieHeader };
}

async function fetchOnce(
  prepared: PreparedRequest,
  headers: Record<string, string>,
  options: SendOptions,
  signal: AbortSignal,
): Promise<UndiciResponse> {
  const payload = await buildPayload({ ...prepared, headers });
  const response = await fetch(prepared.url, {
    method: prepared.method,
    headers: withCookieHeader(payload.headers, options.cookies?.headerFor(prepared.url)),
    body: payload.body as never,
    redirect: 'manual',
    signal,
    dispatcher: dispatcherFor(options.network),
  });
  options.cookies?.store(prepared.url, response.headers.getSetCookie());
  return response;
}

function digestHeaderFor(prepared: PreparedRequest, challengeHeader: string | null): string | undefined {
  const challenge = challengeHeader ? parseDigestChallenge(challengeHeader) : undefined;
  if (!challenge || !prepared.digest) {
    return undefined;
  }
  const context = {
    method: prepared.method,
    uri: digestUriFromUrl(prepared.url),
    cnonce: randomBytes(8).toString('hex'),
    nonceCount: 1,
  };
  return buildDigestAuthorization(challenge, prepared.digest, context);
}

async function fetchWithDigestRetry(prepared: PreparedRequest, options: SendOptions, signal: AbortSignal): Promise<UndiciResponse> {
  const first = await fetchOnce(prepared, prepared.headers, options, signal);
  if (first.status !== 401 || !prepared.digest) {
    return first;
  }
  const authorization = digestHeaderFor(prepared, first.headers.get('www-authenticate'));
  if (!authorization) {
    return first;
  }
  await first.arrayBuffer();
  return fetchOnce(prepared, { ...prepared.headers, Authorization: authorization }, options, signal);
}

function redirectedRequest(prepared: PreparedRequest, response: UndiciResponse): PreparedRequest | undefined {
  const target = resolveRedirect({
    status: response.status,
    method: prepared.method,
    headers: prepared.headers,
    currentUrl: prepared.url,
    location: response.headers.get('location') ?? '',
  });
  if (!target) {
    return undefined;
  }
  const next = { ...prepared, url: target.url, method: target.method, headers: target.headers };
  return target.keepsBody ? next : { ...next, body: undefined, multipart: undefined, bodyFilePath: undefined };
}

async function followRedirects(prepared: PreparedRequest, options: SendOptions, signal: AbortSignal): Promise<FinalHop> {
  let current = prepared;
  for (let redirects = 0; ; redirects++) {
    const response = await fetchWithDigestRetry(current, options, signal);
    const headersReceivedAt = Date.now();
    const next = options.network.followRedirects && redirects < options.network.maxRedirects ? redirectedRequest(current, response) : undefined;
    if (!next) {
      return { response, redirects, headersReceivedAt };
    }
    await response.arrayBuffer();
    current = next;
  }
}

async function toResponseModel(hop: FinalHop, startedAt: number): Promise<ResponseModel> {
  const buffer = await hop.response.arrayBuffer();
  const finishedAt = Date.now();
  const timing: ResponseTiming = {
    waitMs: hop.headersReceivedAt - startedAt,
    downloadMs: finishedAt - hop.headersReceivedAt,
    redirects: hop.redirects,
  };
  return {
    status: hop.response.status,
    statusText: hop.response.statusText,
    timeMs: finishedAt - startedAt,
    sizeBytes: buffer.byteLength,
    headers: Array.from(hop.response.headers.entries()),
    body: new TextDecoder().decode(buffer),
    timing,
  };
}

function linkedAbortController(timeoutMs: number, external: AbortSignal | undefined): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();
  external?.addEventListener('abort', forwardAbort, { once: true });
  if (external?.aborted) {
    controller.abort();
  }
  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', forwardAbort);
    },
  };
}

export async function sendRequest(prepared: PreparedRequest, options: SendOptions): Promise<ResponseModel> {
  const startedAt = Date.now();
  const { signal, release } = linkedAbortController(options.timeoutMs, options.signal);
  try {
    return await toResponseModel(await followRedirects(prepared, options, signal), startedAt);
  } catch (error) {
    const message = options.signal?.aborted ? REQUEST_ABORTED_MESSAGE : describeError(error, options.timeoutMs);
    return errorResponse(message, Date.now() - startedAt);
  } finally {
    release();
  }
}
