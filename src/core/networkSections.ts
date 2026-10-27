import { DiagnosisFacts, DiagnosisSection, DnsFacts, HttpAttemptFacts, StepStatus, TcpFacts, TlsFacts, TransportVariant } from './networkDiagnosis';
import { redactProxyUrl, redactText, redactUrl } from './networkRedaction';

const PLACEHOLDER = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const PROXY_ENV_NAMES = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'];

export interface UrlInputs {
  template: string;
  resolved: string;
}

export interface ProxyInputs {
  routiqProxy: string;
  vscodeProxy: string;
  proxySupport: string;
  useVsCodeNetworkingSetting: boolean;
  effectiveProxyUrl?: string;
  currentVariant: TransportVariant;
  platform: string;
  env: Record<string, string | undefined>;
}

export function unresolvedPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))];
}

function section(title: string, status: StepStatus, lines: string[]): DiagnosisSection {
  return { title, status, lines };
}

export function urlSection(inputs: UrlInputs): DiagnosisSection {
  const unresolved = unresolvedPlaceholders(inputs.resolved);
  const lines = [`Resolved URL: ${redactUrl(inputs.resolved)}`];
  if (unresolved.length > 0) {
    return section('URL', 'fail', [...lines, `Unresolved variables: ${unresolved.join(', ')}`]);
  }
  try {
    const parsed = new URL(inputs.resolved);
    const substituted = inputs.template !== inputs.resolved;
    return section('URL', 'ok', [
      ...lines,
      `Scheme ${parsed.protocol.replace(':', '')}, host ${parsed.hostname}, port ${parsed.port || 'default'}`,
      substituted ? 'Variables were substituted' : 'No variables used',
    ]);
  } catch {
    return section('URL', 'fail', [...lines, 'The URL cannot be parsed']);
  }
}

function envLines(env: ProxyInputs['env']): string[] {
  const present = PROXY_ENV_NAMES.flatMap((name) => {
    const value = env[name] ?? env[name.toLowerCase()];
    return value ? [`${name}=${redactProxyUrl(value)}`] : [];
  });
  return present.length > 0 ? present : ['No proxy environment variables'];
}

function transportReason(inputs: ProxyInputs): string {
  if (inputs.routiqProxy.trim()) {
    return 'routiq.proxy is set, so the built-in HTTP client sends through that proxy (VS Code networking is bypassed).';
  }
  if (inputs.currentVariant === 'vscode') {
    return 'routiq.useVsCodeNetworking is on and routiq.proxy is empty, so Routiq uses VS Code networking (node http).';
  }
  return 'routiq.useVsCodeNetworking is off, so the built-in HTTP client (undici) is used.';
}

function vscodeNetworkingNote(inputs: ProxyInputs): string {
  if (inputs.vscodeProxy.trim()) {
    return `VS Code networking would use http.proxy ${redactProxyUrl(inputs.vscodeProxy)}.`;
  }
  return 'VS Code networking would use the proxy environment variables if present, otherwise the system proxy or PAC script, which VS Code resolves per request and extensions cannot inspect.';
}

function windowsNote(inputs: ProxyInputs): string[] {
  return inputs.platform === 'win32' && inputs.currentVariant !== 'vscode'
    ? ['Windows: a system proxy or PAC script is only honoured through VS Code networking (set routiq.useVsCodeNetworking to true and leave routiq.proxy empty).']
    : [];
}

export function proxySection(inputs: ProxyInputs): DiagnosisSection {
  const proxy = inputs.effectiveProxyUrl ? `Proxy for this URL: ${redactProxyUrl(inputs.effectiveProxyUrl)}` : 'Proxy for this URL: none (direct)';
  return section('Proxy and transport', 'info', [
    `routiq.proxy: ${inputs.routiqProxy.trim() ? redactProxyUrl(inputs.routiqProxy) : '(empty)'}`,
    `http.proxy: ${inputs.vscodeProxy.trim() ? redactProxyUrl(inputs.vscodeProxy) : '(empty)'}`,
    `http.proxySupport: ${inputs.proxySupport}`,
    `routiq.useVsCodeNetworking: ${inputs.useVsCodeNetworkingSetting}`,
    ...envLines(inputs.env),
    proxy,
    `Transport used: ${inputs.currentVariant === 'vscode' ? 'VS Code networking' : 'built-in (undici)'}. ${transportReason(inputs)}`,
    vscodeNetworkingNote(inputs),
    ...windowsNote(inputs),
  ]);
}

export function dnsSection(dns: DnsFacts | undefined, host: string): DiagnosisSection {
  if (!dns) {
    return section('DNS', 'skip', ['Skipped']);
  }
  if (!dns.ok) {
    return section('DNS', 'fail', [`Could not resolve ${host} after ${dns.timeMs} ms: ${redactText(dns.error ?? 'unknown error')}`]);
  }
  const addresses = dns.addresses.map((entry) => `IPv${entry.family} ${entry.address}`);
  const warning = dns.addresses[0]?.family === 6 ? ['The first address is IPv6; an unreachable IPv6 address can cause long waits.'] : [];
  return section('DNS', warning.length > 0 ? 'warn' : 'ok', [`Resolved ${host} in ${dns.timeMs} ms`, ...addresses, ...warning]);
}

function tcpLine(tcp: TcpFacts): string {
  const outcome = tcp.ok ? `connected in ${tcp.timeMs} ms` : `${tcp.errorKind ?? 'failed'} after ${tcp.timeMs} ms (${redactText(tcp.error ?? '')})`;
  return `${tcp.target} IPv${tcp.family} ${tcp.address}: ${outcome}`;
}

export function tcpSection(title: string, results: TcpFacts[]): DiagnosisSection {
  if (results.length === 0) {
    return section(title, 'skip', ['Skipped']);
  }
  const anyOk = results.some((tcp) => tcp.ok);
  const allOk = results.every((tcp) => tcp.ok);
  return section(title, allOk ? 'ok' : anyOk ? 'warn' : 'fail', results.map(tcpLine));
}

const VARIANT_LABELS: Record<TransportVariant, string> = {
  current: 'Routiq current configuration',
  direct: 'Forced direct (built-in client, no proxy)',
  vscode: 'Forced VS Code networking (node http)',
};

function attemptLine(attempt: HttpAttemptFacts, currentVariant: TransportVariant): string {
  const scope = attempt.usesRealRequest ? `real ${attempt.method} request` : `${attempt.method} to origin`;
  const outcome = attempt.ok ? `HTTP ${attempt.status} in ${attempt.timeMs} ms` : `${attempt.errorKind ?? 'error'} after ${attempt.timeMs} ms: ${redactText(attempt.error ?? '')}`;
  const current = attempt.variant === currentVariant ? ' [current]' : '';
  return `${VARIANT_LABELS[attempt.variant]}${current} (${scope}): ${outcome}`;
}

export function httpSection(attempts: HttpAttemptFacts[], currentVariant: TransportVariant): DiagnosisSection {
  if (attempts.length === 0) {
    return section('HTTP attempts', 'skip', ['Skipped']);
  }
  const statuses = attempts.map((attempt): StepStatus => (attempt.ok ? 'ok' : 'fail'));
  const status = statuses.every((value) => value === 'ok') ? 'ok' : statuses.includes('ok') ? 'warn' : 'fail';
  return section('HTTP attempts', status, attempts.map((attempt) => attemptLine(attempt, currentVariant)));
}

export function tlsSection(tls: TlsFacts | undefined): DiagnosisSection {
  if (!tls) {
    return section('TLS', 'skip', ['Skipped (not https or host not reachable)']);
  }
  const details = [
    `Subject: ${tls.subject ?? 'unknown'}`,
    `Issuer: ${tls.issuer ?? 'unknown'}`,
    `Valid until: ${tls.validTo ?? 'unknown'}`,
    `Protocol: ${tls.protocol ?? 'unknown'}`,
  ];
  if (tls.ok) {
    return section('TLS', 'ok', [...details, 'Certificate verifies against the bundled CA store']);
  }
  const hint = 'The issuer is not trusted by the bundled CA store; VS Code networking additionally uses the operating system certificates.';
  return section('TLS', 'fail', [...details, `Verification error: ${tls.errorCode ?? tls.error}`, hint]);
}

export function allSections(parts: {
  url: UrlInputs;
  proxy: ProxyInputs;
  facts: DiagnosisFacts;
}): DiagnosisSection[] {
  const { facts } = parts;
  const tcpProxy = facts.proxyTcp ? [facts.proxyTcp] : [];
  return [
    urlSection(parts.url),
    proxySection(parts.proxy),
    dnsSection(facts.dns, facts.host),
    tcpSection('TCP connect (direct)', facts.directTcp),
    tcpSection('TCP connect (proxy)', tcpProxy),
    httpSection(facts.attempts, facts.currentVariant),
    tlsSection(facts.tls),
  ];
}
