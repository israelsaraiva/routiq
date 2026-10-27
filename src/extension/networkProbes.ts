import { lookup } from 'node:dns/promises';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { NetworkSettings } from '../core/network';
import { DnsFacts, HttpAttemptFacts, ResolvedAddress, TcpFacts, TlsFacts, TransportVariant } from '../core/networkDiagnosis';
import { NetworkErrorKind, classifyError, shapeOf } from '../core/networkErrors';
import { PreparedRequest } from '../core/requestBuilder';
import { sendRequestDetailed } from './httpClient';

export interface Endpoint {
  host: string;
  port: number;
}

export function networkForVariant(base: NetworkSettings, variant: TransportVariant): NetworkSettings {
  if (variant === 'direct') {
    return { ...base, useVsCodeNetworking: false, proxyUrl: undefined };
  }
  return variant === 'vscode' ? { ...base, useVsCodeNetworking: true } : base;
}

function failureOf(error: unknown): { errorKind: NetworkErrorKind; error: string } {
  const shape = shapeOf(error);
  return { errorKind: classifyError(shape), error: shape.code ? `${shape.code}: ${shape.message}` : shape.message };
}

function rejectAfter(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(Object.assign(new Error(`Timed out after ${timeoutMs} ms`), { code: 'ETIMEDOUT' })), timeoutMs).unref();
  });
}

export async function resolveHost(host: string, timeoutMs: number): Promise<DnsFacts> {
  const startedAt = Date.now();
  try {
    const found = await Promise.race([lookup(host, { all: true, verbatim: true }), rejectAfter(timeoutMs)]);
    const addresses = found.map((entry): ResolvedAddress => ({ address: entry.address, family: entry.family === 6 ? 6 : 4 }));
    return { ok: true, addresses, timeMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, addresses: [], timeMs: Date.now() - startedAt, ...failureOf(error) };
  }
}

export function probeTcp(label: string, address: ResolvedAddress, port: number, timeoutMs: number): Promise<TcpFacts> {
  const startedAt = Date.now();
  const base = { target: label, address: address.address, family: address.family };
  return new Promise((resolve) => {
    const socket = connectTcp({ host: address.address, port, timeout: timeoutMs, autoSelectFamily: false } as never);
    const finish = (outcome: Partial<TcpFacts>) => {
      socket.destroy();
      resolve({ ...base, ok: false, timeMs: Date.now() - startedAt, ...outcome });
    };
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ errorKind: 'connect-timeout', error: `no connection within ${timeoutMs} ms` }));
    socket.once('error', (error) => finish(failureOf(error)));
  });
}

function nameOf(entity: { CN?: string | string[]; O?: string | string[] } | undefined): string {
  const name = entity?.CN ?? entity?.O;
  return Array.isArray(name) ? name.join(', ') : (name ?? 'unknown');
}

export function probeTls(endpoint: Endpoint, timeoutMs: number): Promise<TlsFacts> {
  return new Promise((resolve) => {
    const socket = connectTls({ host: endpoint.host, port: endpoint.port, servername: endpoint.host, rejectUnauthorized: false, timeout: timeoutMs });
    const finish = (facts: TlsFacts) => {
      socket.destroy();
      resolve(facts);
    };
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      const verification = socket.authorizationError ? String(socket.authorizationError) : undefined;
      finish({
        ok: socket.authorized,
        subject: nameOf(certificate.subject),
        issuer: nameOf(certificate.issuer),
        validTo: certificate.valid_to,
        protocol: socket.getProtocol() ?? undefined,
        errorCode: verification,
        error: verification,
      });
    });
    socket.once('timeout', () => finish({ ok: false, error: `no TLS handshake within ${timeoutMs} ms`, errorCode: 'ETIMEDOUT' }));
    socket.once('error', (error) => finish({ ok: false, ...failureOf(error), errorCode: shapeOf(error).code }));
  });
}

export interface HttpProbe {
  variant: TransportVariant;
  prepared: PreparedRequest;
  usesRealRequest: boolean;
  network: NetworkSettings;
  timeoutMs: number;
}

export async function probeHttp(probe: HttpProbe): Promise<HttpAttemptFacts> {
  const network = { ...networkForVariant(probe.network, probe.variant), followRedirects: false, maxRedirects: 0 };
  const { response, errorKind } = await sendRequestDetailed(probe.prepared, { timeoutMs: probe.timeoutMs, network });
  const base = { variant: probe.variant, usesRealRequest: probe.usesRealRequest, method: probe.prepared.method, timeMs: response.timeMs };
  return response.error
    ? { ...base, ok: false, errorKind: errorKind ?? 'other', error: response.error }
    : { ...base, ok: true, status: response.status };
}
