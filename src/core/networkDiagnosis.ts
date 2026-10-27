import { NetworkErrorKind } from './networkErrors';

export type StepStatus = 'ok' | 'warn' | 'fail' | 'skip' | 'info';
export type TransportVariant = 'current' | 'direct' | 'vscode';
export type Severity = 'problem' | 'hint' | 'good';

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface DnsFacts {
  ok: boolean;
  addresses: ResolvedAddress[];
  timeMs: number;
  errorKind?: NetworkErrorKind;
  error?: string;
}

export interface TcpFacts {
  target: string;
  address: string;
  family: 4 | 6;
  ok: boolean;
  timeMs: number;
  errorKind?: NetworkErrorKind;
  error?: string;
}

export interface HttpAttemptFacts {
  variant: TransportVariant;
  usesRealRequest: boolean;
  method: string;
  ok: boolean;
  status?: number;
  timeMs: number;
  errorKind?: NetworkErrorKind;
  error?: string;
}

export interface TlsFacts {
  ok: boolean;
  subject?: string;
  issuer?: string;
  validTo?: string;
  protocol?: string;
  errorCode?: string;
  error?: string;
}

export interface DiagnosisFacts {
  host: string;
  isHttps: boolean;
  platform: string;
  proxyUrl?: string;
  routiqProxyConfigured: boolean;
  currentVariant: TransportVariant;
  dns?: DnsFacts;
  directTcp: TcpFacts[];
  proxyTcp?: TcpFacts;
  attempts: HttpAttemptFacts[];
  tls?: TlsFacts;
}

export interface Conclusion {
  severity: Severity;
  text: string;
}

export interface DiagnosisSection {
  title: string;
  status: StepStatus;
  lines: string[];
}

export interface DiagnosisReport {
  generatedAt: string;
  sections: DiagnosisSection[];
  conclusions: Conclusion[];
}

const TIMEOUT_KINDS: NetworkErrorKind[] = ['connect-timeout', 'response-timeout', 'timeout'];

function isTimeoutAttempt(attempt: HttpAttemptFacts): boolean {
  return !attempt.ok && attempt.errorKind !== undefined && TIMEOUT_KINDS.includes(attempt.errorKind);
}

function attemptFor(facts: DiagnosisFacts, variant: TransportVariant, real = false): HttpAttemptFacts | undefined {
  return facts.attempts.find((attempt) => attempt.variant === variant && attempt.usesRealRequest === real);
}

function settingForVariant(variant: TransportVariant, facts: DiagnosisFacts): string {
  if (variant === 'vscode') {
    return 'set routiq.useVsCodeNetworking to true and clear routiq.proxy';
  }
  return facts.proxyUrl
    ? 'bypass the proxy: clear routiq.proxy and http.proxy, or add this host to NO_PROXY'
    : 'set routiq.useVsCodeNetworking to false';
}

function dnsConclusions(facts: DiagnosisFacts): Conclusion[] {
  if (!facts.dns || facts.dns.ok) {
    return [];
  }
  const proxyHint = facts.proxyUrl ? ' A proxy is configured, so name resolution may be expected on the proxy side.' : '';
  return [
    {
      severity: facts.proxyUrl ? 'hint' : 'problem',
      text: `DNS could not resolve ${facts.host} (${facts.dns.error ?? 'unknown error'}). Check the host name, VPN connection and DNS suffix.${proxyHint}`,
    },
  ];
}

function addressFamilyConclusions(facts: DiagnosisFacts): Conclusion[] {
  const sixFailed = facts.directTcp.some((tcp) => tcp.family === 6 && !tcp.ok);
  const fourOk = facts.directTcp.some((tcp) => tcp.family === 4 && tcp.ok);
  if (sixFailed && fourOk) {
    return [
      {
        severity: 'hint',
        text: 'An IPv6 address of this host is unreachable while IPv4 works. Routiq falls back to IPv4 after 250 ms, but other tools may hang; prefer the IPv4 address or fix the AAAA record.',
      },
    ];
  }
  const onlySix = facts.dns?.ok && facts.dns.addresses.length > 0 && facts.dns.addresses.every((address) => address.family === 6);
  return onlySix && facts.directTcp.every((tcp) => !tcp.ok)
    ? [{ severity: 'problem', text: 'The host resolves to IPv6 addresses only and none are reachable from this network. Use an IPv4 name or a proxy.' }]
    : [];
}

function proxyOnlyConclusions(facts: DiagnosisFacts): Conclusion[] {
  const directFailed = facts.directTcp.length > 0 && facts.directTcp.every((tcp) => !tcp.ok);
  if (!facts.proxyUrl || !directFailed) {
    return [];
  }
  if (facts.proxyTcp?.ok) {
    return [
      {
        severity: 'problem',
        text: `The host is not reachable directly but the proxy ${facts.proxyUrl} is. Route through the proxy: set routiq.proxy to ${facts.proxyUrl} (or enable routiq.useVsCodeNetworking).`,
      },
    ];
  }
  return [{ severity: 'problem', text: `Neither the host nor the proxy ${facts.proxyUrl} can be reached. Check VPN/network connectivity and the proxy address.` }];
}

function transportConclusions(facts: DiagnosisFacts): Conclusion[] {
  const current = attemptFor(facts, facts.currentVariant);
  const working = facts.attempts.filter((attempt) => attempt.ok && !attempt.usesRealRequest);
  const alternative = working.find((attempt) => attempt.variant !== facts.currentVariant);
  if (current && !current.ok && alternative) {
    return [
      {
        severity: 'problem',
        text: `The current configuration fails (${current.error ?? current.errorKind}) but the ${alternative.variant === 'vscode' ? 'VS Code networking' : 'direct'} transport works: ${settingForVariant(alternative.variant, facts)}.`,
      },
    ];
  }
  return [];
}

function proxyPathConclusions(facts: DiagnosisFacts): Conclusion[] {
  const viaVsCode = attemptFor(facts, 'vscode');
  const direct = attemptFor(facts, 'direct');
  if (viaVsCode?.ok && direct && !direct.ok && facts.platform === 'win32') {
    return [{ severity: 'hint', text: 'On Windows a system proxy or PAC script can only be honoured through VS Code networking; keep routiq.useVsCodeNetworking enabled and leave routiq.proxy empty.' }];
  }
  return [];
}

function allFailedConclusions(facts: DiagnosisFacts): Conclusion[] {
  const plain = facts.attempts.filter((attempt) => !attempt.usesRealRequest);
  const tcpReachable = facts.directTcp.some((tcp) => tcp.ok);
  if (plain.length === 0 || plain.some((attempt) => attempt.ok) || !tcpReachable) {
    return [];
  }
  const responseTimeouts = plain.every((attempt) => attempt.errorKind === 'response-timeout' || attempt.errorKind === 'timeout');
  return responseTimeouts
    ? [
        {
          severity: 'problem',
          text: 'The TCP connection succeeds but no HTTP response arrives on any transport. A firewall, TLS-inspecting gateway or required proxy is likely dropping the traffic, or the port speaks another protocol. Try the other scheme (http/https) or a proxy.',
        },
      ]
    : [];
}

function requestSpecificConclusions(facts: DiagnosisFacts): Conclusion[] {
  const real = facts.attempts.filter((attempt) => attempt.usesRealRequest);
  const safeOk = facts.attempts.some((attempt) => attempt.ok && !attempt.usesRealRequest);
  const realFailed = real.find((attempt) => !attempt.ok);
  if (!safeOk || !realFailed) {
    return [];
  }
  const reason = isTimeoutAttempt(realFailed) ? 'times out' : `fails (${realFailed.error ?? realFailed.errorKind})`;
  return [
    {
      severity: 'problem',
      text: `A plain ${facts.attempts.find((attempt) => attempt.ok)?.method ?? 'GET'} to the host works but the real ${realFailed.method} request ${reason}. Suspect the gateway, headers, body size or auth for this specific request; compare with the Postman console.`,
    },
  ];
}

function tlsConclusions(facts: DiagnosisFacts): Conclusion[] {
  if (!facts.isHttps || !facts.tls || facts.tls.ok) {
    return [];
  }
  return [
    {
      severity: 'problem',
      text: `TLS verification fails (${facts.tls.errorCode ?? facts.tls.error}). A corporate CA is probably missing from the bundled certificates: enable routiq.useVsCodeNetworking to use the system certificates, or temporarily disable routiq.rejectUnauthorized to confirm.`,
    },
  ];
}

function healthyConclusions(facts: DiagnosisFacts, problems: Conclusion[]): Conclusion[] {
  const everythingWorks = facts.attempts.length > 0 && facts.attempts.every((attempt) => attempt.ok);
  if (problems.length > 0 || !everythingWorks) {
    return [];
  }
  return [
    {
      severity: 'good',
      text: 'Every transport reaches the host. If the request still times out, the cause is request-specific (headers, body, auth, server processing time): raise routiq.timeoutMs or compare with Postman.',
    },
  ];
}

export function buildConclusions(facts: DiagnosisFacts): Conclusion[] {
  const problems = [
    ...dnsConclusions(facts),
    ...proxyOnlyConclusions(facts),
    ...transportConclusions(facts),
    ...allFailedConclusions(facts),
    ...requestSpecificConclusions(facts),
    ...tlsConclusions(facts),
  ];
  const hints = [...addressFamilyConclusions(facts), ...proxyPathConclusions(facts)];
  const all = [...problems, ...hints];
  const outcome = all.length > 0 ? all : healthyConclusions(facts, problems);
  return outcome.length > 0 ? outcome : [{ severity: 'hint', text: 'No definite cause found. Share this report when asking for help.' }];
}

const STATUS_MARKERS: Record<StepStatus, string> = { ok: '[OK]', warn: '[WARN]', fail: '[FAIL]', skip: '[SKIP]', info: '[INFO]' };
const SEVERITY_MARKERS: Record<Severity, string> = { problem: '[PROBLEM]', hint: '[HINT]', good: '[OK]' };

export function formatReport(report: DiagnosisReport): string {
  const sections = report.sections.map((section) => [`${STATUS_MARKERS[section.status]} ${section.title}`, ...section.lines.map((line) => `    ${line}`)].join('\n'));
  const conclusions = report.conclusions.map((conclusion) => `${SEVERITY_MARKERS[conclusion.severity]} ${conclusion.text}`);
  return [`Routiq network diagnosis (${report.generatedAt})`, '', ...sections.flatMap((section) => [section, '']), 'Conclusion', ...conclusions].join('\n');
}
