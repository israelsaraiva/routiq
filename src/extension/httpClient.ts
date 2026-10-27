import { randomBytes } from 'node:crypto';
import { Agent, Dispatcher, ProxyAgent, buildConnector, fetch } from 'undici';
import { SignableBody, signAwsRequest } from '../core/awsSigV4';
import { buildDigestAuthorization, digestUriFromUrl, parseDigestChallenge } from '../core/digest';
import { ADDRESS_FALLBACK_TIMEOUT_MS, NetworkSettings, effectiveConnectTimeoutMs } from '../core/network';
import { NetworkErrorKind, classifyError, resolveTimeoutKind, shapeOf, timeoutMessage, usesVsCodeNetworking, withRoutingHint } from '../core/networkErrors';
import { PreparedRequest } from '../core/requestBuilder';
import { resolveRedirect } from '../core/redirects';
import { ResponseModel, ResponseTiming } from '../shared/types';
import { sendViaNode, TransportResponse } from './nodeTransport';
import { FetchPayload, buildPayload } from './requestPayload';

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
  response: TransportResponse;
  redirects: number;
  headersReceivedAt: number;
}

export const REQUEST_ABORTED_MESSAGE = 'Request aborted';

const dispatchers = new Map<string, Dispatcher>();

export function connectOptionsFor(network: NetworkSettings): buildConnector.BuildOptions {
  return {
    rejectUnauthorized: network.rejectUnauthorized,
    timeout: effectiveConnectTimeoutMs(network),
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: ADDRESS_FALLBACK_TIMEOUT_MS,
  } as buildConnector.BuildOptions;
}

export function dispatcherFor(network: NetworkSettings): Dispatcher {
  const key = `${network.proxyUrl ?? ''}|${network.rejectUnauthorized}|${effectiveConnectTimeoutMs(network)}`;
  const cached = dispatchers.get(key);
  if (cached) {
    return cached;
  }
  const connect = connectOptionsFor(network);
  const created = network.proxyUrl
    ? new ProxyAgent({ uri: network.proxyUrl, requestTls: connect, proxyTls: connect })
    : new Agent({ connect });
  dispatchers.set(key, created);
  return created;
}

function errorResponse(message: string, timeMs: number): ResponseModel {
  return { status: 0, statusText: '', timeMs, sizeBytes: 0, headers: [], body: '', error: message };
}

interface RequestFailure {
  message: string;
  kind: NetworkErrorKind;
}

function describeError(error: unknown, options: SendOptions): RequestFailure {
  const shape = shapeOf(error);
  const context = { timeoutMs: options.timeoutMs, connectTimeoutMs: effectiveConnectTimeoutMs(options.network) };
  const kind = resolveTimeoutKind(classifyError(shape), context);
  if (kind === 'connect-timeout' || kind === 'response-timeout' || kind === 'timeout') {
    return { kind, message: withRoutingHint(timeoutMessage(kind, context), options.network) };
  }
  if (error instanceof Error) {
    const message = shape.causeMessage ? `${shape.message}: ${shape.causeMessage}` : shape.message;
    return { kind, message: shape.causeMessage || shape.code ? withRoutingHint(message, options.network) : message };
  }
  return { kind, message: String(error) };
}

function sendViaTransport(
  prepared: PreparedRequest,
  headers: Record<string, string>,
  body: Awaited<ReturnType<typeof buildPayload>>['body'],
  options: SendOptions,
  signal: AbortSignal,
): Promise<TransportResponse> {
  if (usesVsCodeNetworking(options.network)) {
    return sendViaNode({
      url: prepared.url,
      method: prepared.method,
      headers,
      body,
      rejectUnauthorized: options.network.rejectUnauthorized,
      connectTimeoutMs: effectiveConnectTimeoutMs(options.network),
      signal,
    });
  }
  return fetch(prepared.url, {
    method: prepared.method,
    headers,
    body: body as never,
    redirect: 'manual',
    signal,
    dispatcher: dispatcherFor(options.network),
  });
}

export function withCookieHeader(headers: Record<string, string>, cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return headers;
  }
  const existingName = Object.keys(headers).find((name) => name.toLowerCase() === 'cookie');
  const existing = existingName ? headers[existingName] : undefined;
  return { ...headers, [existingName ?? 'Cookie']: existing ? `${existing}; ${cookieHeader}` : cookieHeader };
}

const DEFAULT_HEADERS: Record<string, string> = { 'User-Agent': 'Routiq', Accept: '*/*' };

export function withDefaultHeaders(headers: Record<string, string>): Record<string, string> {
  const present = new Set(Object.keys(headers).map((name) => name.toLowerCase()));
  const missing = Object.entries(DEFAULT_HEADERS).filter(([name]) => !present.has(name.toLowerCase()));
  return { ...Object.fromEntries(missing), ...headers };
}

function signableBodyOf(body: FetchPayload['body']): SignableBody {
  return body instanceof FormData ? 'UNSIGNED-PAYLOAD' : body;
}

function withAwsSignature(prepared: PreparedRequest, payload: FetchPayload, headers: Record<string, string>): Record<string, string> {
  if (!prepared.awsSigV4) {
    return headers;
  }
  return signAwsRequest({
    method: prepared.method,
    url: prepared.url,
    headers,
    body: signableBodyOf(payload.body),
    settings: prepared.awsSigV4,
    now: new Date(),
  });
}

async function fetchOnce(
  prepared: PreparedRequest,
  headers: Record<string, string>,
  options: SendOptions,
  signal: AbortSignal,
): Promise<TransportResponse> {
  const payload = await buildPayload({ ...prepared, headers });
  const unsigned = withDefaultHeaders(withCookieHeader(payload.headers, options.cookies?.headerFor(prepared.url)));
  const headersWithCookies = withAwsSignature(prepared, payload, unsigned);
  const response = await sendViaTransport(prepared, headersWithCookies, payload.body, options, signal);
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

async function fetchWithDigestRetry(prepared: PreparedRequest, options: SendOptions, signal: AbortSignal): Promise<TransportResponse> {
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

function redirectedRequest(prepared: PreparedRequest, response: TransportResponse): PreparedRequest | undefined {
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

export interface DetailedResult {
  response: ResponseModel;
  errorKind?: NetworkErrorKind;
}

export async function sendRequestDetailed(prepared: PreparedRequest, options: SendOptions): Promise<DetailedResult> {
  const startedAt = Date.now();
  const { signal, release } = linkedAbortController(options.timeoutMs, options.signal);
  try {
    return { response: await toResponseModel(await followRedirects(prepared, options, signal), startedAt) };
  } catch (error) {
    if (options.signal?.aborted) {
      return { response: errorResponse(REQUEST_ABORTED_MESSAGE, Date.now() - startedAt) };
    }
    const failure = describeError(error, options);
    return { response: errorResponse(failure.message, Date.now() - startedAt), errorKind: failure.kind };
  } finally {
    release();
  }
}

export async function sendRequest(prepared: PreparedRequest, options: SendOptions): Promise<ResponseModel> {
  return (await sendRequestDetailed(prepared, options)).response;
}
