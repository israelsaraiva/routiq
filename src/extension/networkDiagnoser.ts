import { NetworkSettings, effectiveConnectTimeoutMs } from '../core/network';
import { Conclusion, DiagnosisFacts, DiagnosisReport, ResolvedAddress, TcpFacts, TransportVariant, buildConclusions } from '../core/networkDiagnosis';
import { ProxyInputs, UrlInputs, allSections, urlSection } from '../core/networkSections';
import { redactProxyUrl } from '../core/networkRedaction';
import { PreparedRequest } from '../core/requestBuilder';
import { usesVsCodeNetworking } from '../core/networkErrors';
import { Endpoint, probeHttp, probeTcp, probeTls, resolveHost } from './networkProbes';

const MAX_PROBED_ADDRESSES = 4;
const MAX_STAGE_TIMEOUT_MS = 15000;
const DNS_TIMEOUT_MS = 5000;

export interface DiagnosisEnvironment {
  network: NetworkSettings;
  timeoutMs: number;
  platform: string;
  proxy: Omit<ProxyInputs, 'effectiveProxyUrl' | 'currentVariant' | 'platform'>;
}

export interface DiagnosisInput {
  url: UrlInputs;
  prepared: PreparedRequest;
  useRealRequest: boolean;
}

function endpointOf(url: URL): Endpoint {
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port };
}

function currentVariantOf(network: NetworkSettings): TransportVariant {
  if (usesVsCodeNetworking(network)) {
    return 'vscode';
  }
  return network.proxyUrl ? 'current' : 'direct';
}

function variantsToProbe(currentVariant: TransportVariant): TransportVariant[] {
  return [...new Set<TransportVariant>([currentVariant, 'direct', 'vscode'])];
}

function safeRequestFor(url: URL): PreparedRequest {
  return { url: `${url.origin}/`, method: 'GET', headers: {} };
}

function failedTcp(label: string, message: string): TcpFacts {
  return { target: label, address: '-', family: 4, ok: false, timeMs: 0, errorKind: 'dns', error: message };
}

async function probeProxy(proxyUrl: string, timeoutMs: number): Promise<TcpFacts> {
  const label = `proxy ${redactProxyUrl(proxyUrl)}`;
  try {
    const parsed = new URL(proxyUrl);
    const endpoint = { host: parsed.hostname, port: parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80 };
    const dns = await resolveHost(endpoint.host, DNS_TIMEOUT_MS);
    const first = dns.addresses[0];
    return first ? probeTcp(label, first, endpoint.port, timeoutMs) : failedTcp(label, dns.error ?? 'proxy host did not resolve');
  } catch {
    return failedTcp(label, 'invalid proxy URL');
  }
}

function probeDirect(addresses: ResolvedAddress[], port: number, timeoutMs: number): Promise<TcpFacts[]> {
  return Promise.all(addresses.slice(0, MAX_PROBED_ADDRESSES).map((address) => probeTcp('direct', address, port, timeoutMs)));
}

async function probeHttpVariants(url: URL, input: DiagnosisInput, environment: DiagnosisEnvironment, currentVariant: TransportVariant) {
  const timeoutMs = Math.min(environment.timeoutMs, MAX_STAGE_TIMEOUT_MS);
  const attempts = [];
  for (const variant of variantsToProbe(currentVariant)) {
    attempts.push(await probeHttp({ variant, prepared: safeRequestFor(url), usesRealRequest: false, network: environment.network, timeoutMs }));
  }
  if (input.useRealRequest) {
    const real = { variant: currentVariant, prepared: input.prepared, usesRealRequest: true, network: environment.network, timeoutMs };
    attempts.push(await probeHttp(real));
  }
  return attempts;
}

function proxyInputsFor(environment: DiagnosisEnvironment, currentVariant: TransportVariant): ProxyInputs {
  return {
    ...environment.proxy,
    effectiveProxyUrl: environment.network.proxyUrl,
    currentVariant,
    platform: environment.platform,
  };
}

function reportOf(sections: DiagnosisReport['sections'], conclusions: Conclusion[]): DiagnosisReport {
  return { generatedAt: new Date().toISOString(), sections, conclusions };
}

function parseUrl(resolved: string): URL | undefined {
  try {
    return new URL(resolved);
  } catch {
    return undefined;
  }
}

export async function diagnoseNetwork(input: DiagnosisInput, environment: DiagnosisEnvironment): Promise<DiagnosisReport> {
  const url = parseUrl(input.url.resolved);
  if (!url || !['http:', 'https:'].includes(url.protocol)) {
    return reportOf([urlSection(input.url)], [{ severity: 'problem', text: 'The URL is not a valid http(s) URL after variable substitution.' }]);
  }
  const endpoint = endpointOf(url);
  const currentVariant = currentVariantOf(environment.network);
  const stageTimeoutMs = Math.min(effectiveConnectTimeoutMs(environment.network), MAX_STAGE_TIMEOUT_MS);
  const dns = await resolveHost(endpoint.host, DNS_TIMEOUT_MS);
  const directTcp = await probeDirect(dns.addresses, endpoint.port, stageTimeoutMs);
  const proxyTcp = environment.network.proxyUrl ? await probeProxy(environment.network.proxyUrl, stageTimeoutMs) : undefined;
  const attempts = await probeHttpVariants(url, input, environment, currentVariant);
  const reachable = directTcp.some((tcp) => tcp.ok);
  const tls = url.protocol === 'https:' && reachable ? await probeTls(endpoint, stageTimeoutMs) : undefined;
  const facts: DiagnosisFacts = {
    host: endpoint.host,
    isHttps: url.protocol === 'https:',
    platform: environment.platform,
    proxyUrl: environment.network.proxyUrl ? redactProxyUrl(environment.network.proxyUrl) : undefined,
    routiqProxyConfigured: environment.proxy.routiqProxy.trim() !== '',
    currentVariant,
    dns,
    directTcp,
    proxyTcp,
    attempts,
    tls,
  };
  return reportOf(allSections({ url: input.url, proxy: proxyInputsFor(environment, currentVariant), facts }), buildConclusions(facts));
}
