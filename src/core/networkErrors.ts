import { NetworkSettings } from './network';
import { redactProxyUrl } from './networkRedaction';

export type NetworkErrorKind = 'connect-timeout' | 'response-timeout' | 'timeout' | 'dns' | 'refused' | 'reset' | 'tls' | 'unreachable' | 'other';

export interface ErrorShape {
  name?: string;
  code?: string;
  message: string;
  causeCode?: string;
  causeMessage?: string;
}

const CODE_KINDS: Array<[RegExp, NetworkErrorKind]> = [
  [/^(UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT)$/, 'connect-timeout'],
  [/^UND_ERR_HEADERS_TIMEOUT$|^UND_ERR_BODY_TIMEOUT$/, 'response-timeout'],
  [/^(ENOTFOUND|EAI_AGAIN|EAI_FAIL)$/, 'dns'],
  [/^ECONNREFUSED$/, 'refused'],
  [/^(ECONNRESET|EPIPE|UND_ERR_SOCKET)$/, 'reset'],
  [/^(ENETUNREACH|EHOSTUNREACH|EADDRNOTAVAIL)$/, 'unreachable'],
  [/^(CERT_|ERR_TLS_|ERR_SSL_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|EPROTO|HOSTNAME_MISMATCH)/, 'tls'],
];

export function shapeOf(error: unknown): ErrorShape {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  const withDetails = error as Error & { code?: string; cause?: { code?: string; message?: string } };
  return {
    name: error.name,
    code: withDetails.code,
    message: error.message,
    causeCode: withDetails.cause?.code,
    causeMessage: withDetails.cause?.message,
  };
}

export function classifyError(shape: ErrorShape): NetworkErrorKind {
  for (const code of [shape.code, shape.causeCode]) {
    const match = code && CODE_KINDS.find(([pattern]) => pattern.test(code));
    if (match) {
      return match[1];
    }
  }
  return shape.name === 'TimeoutError' || shape.name === 'AbortError' ? 'timeout' : 'other';
}

export function usesVsCodeNetworking(network: NetworkSettings): boolean {
  return network.useVsCodeNetworking === true;
}

export function describeRouting(network: NetworkSettings): string {
  if (usesVsCodeNetworking(network)) {
    return 'via VS Code networking';
  }
  return network.proxyUrl ? `via proxy ${redactProxyUrl(network.proxyUrl)}` : 'direct connection';
}

export interface TimeoutContext {
  timeoutMs: number;
  connectTimeoutMs: number;
}

export function timeoutMessage(kind: NetworkErrorKind, context: TimeoutContext): string {
  if (kind === 'connect-timeout') {
    return `Connect timeout after ${context.connectTimeoutMs} ms: the host could not be reached`;
  }
  if (kind === 'response-timeout') {
    return `Response timeout after ${context.timeoutMs} ms (waiting for server): the host was reached but sent no response`;
  }
  return `Request timed out after ${context.timeoutMs} ms`;
}

export function resolveTimeoutKind(kind: NetworkErrorKind, context: TimeoutContext): NetworkErrorKind {
  if (kind !== 'timeout') {
    return kind;
  }
  return context.connectTimeoutMs < context.timeoutMs ? 'response-timeout' : 'timeout';
}

export function withRoutingHint(message: string, network: NetworkSettings): string {
  return `${message} (${describeRouting(network)}). Check the routiq.proxy, http.proxy, routiq.timeoutMs and routiq.connectTimeoutMs settings, or run Diagnose network.`;
}

const ROUTING_HINT = /\((via VS Code networking|via proxy [^)]*|direct connection)\)/;

export function isNetworkFailureMessage(message: string): boolean {
  return ROUTING_HINT.test(message);
}
