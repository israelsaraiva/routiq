import { describe, expect, it } from 'vitest';
import { DiagnosisFacts, HttpAttemptFacts, TcpFacts, buildConclusions, formatReport } from './networkDiagnosis';
import { dnsSection, proxySection, tlsSection, unresolvedPlaceholders, urlSection } from './networkSections';

const tcp = (family: 4 | 6, ok: boolean): TcpFacts => ({ target: 'direct', address: family === 4 ? '10.0.0.1' : '::1', family, ok, timeMs: 5 });
const attempt = (variant: HttpAttemptFacts['variant'], ok: boolean, extra: Partial<HttpAttemptFacts> = {}): HttpAttemptFacts => ({
  variant,
  usesRealRequest: false,
  method: 'GET',
  ok,
  timeMs: 10,
  ...(ok ? { status: 200 } : { errorKind: 'response-timeout', error: 'Response timeout' }),
  ...extra,
});

function facts(overrides: Partial<DiagnosisFacts>): DiagnosisFacts {
  return {
    host: 'api.corp',
    isHttps: false,
    platform: 'linux',
    routiqProxyConfigured: false,
    currentVariant: 'direct',
    dns: { ok: true, addresses: [{ address: '10.0.0.1', family: 4 }], timeMs: 3 },
    directTcp: [tcp(4, true)],
    attempts: [],
    ...overrides,
  };
}

const texts = (input: DiagnosisFacts) => buildConclusions(input).map((conclusion) => conclusion.text);

describe('buildConclusions', () => {
  it('recommends VS Code networking when direct fails but it works', () => {
    const result = texts(facts({ attempts: [attempt('direct', false), attempt('vscode', true)] }));
    expect(result.join(' ')).toContain('set routiq.useVsCodeNetworking to true');
  });

  it('recommends the direct transport when VS Code networking fails but direct works', () => {
    const result = texts(facts({ currentVariant: 'vscode', attempts: [attempt('direct', true), attempt('vscode', false)] }));
    expect(result.join(' ')).toContain('set routiq.useVsCodeNetworking to false');
  });

  it('points at the proxy when only the proxy is reachable', () => {
    const result = texts(facts({ proxyUrl: 'http://proxy:3128', directTcp: [tcp(4, false)], proxyTcp: { ...tcp(4, true), target: 'proxy' }, attempts: [] }));
    expect(result.join(' ')).toContain('set routiq.proxy to http://proxy:3128');
  });

  it('blames the gateway when only the real request fails', () => {
    const real = attempt('direct', false, { usesRealRequest: true, method: 'POST' });
    const result = texts(facts({ attempts: [attempt('direct', true), real] }));
    expect(result.join(' ')).toContain('real POST request times out');
  });

  it('reports a silent host when TCP works but no transport gets a response', () => {
    const result = texts(facts({ attempts: [attempt('direct', false), attempt('vscode', false)] }));
    expect(result.join(' ')).toContain('no HTTP response arrives on any transport');
  });

  it('flags DNS failures and unreachable IPv6 with working IPv4', () => {
    expect(texts(facts({ dns: { ok: false, addresses: [], timeMs: 9, error: 'ENOTFOUND' }, directTcp: [] })).join(' ')).toContain('DNS could not resolve');
    expect(texts(facts({ directTcp: [tcp(6, false), tcp(4, true)], attempts: [attempt('direct', true)] })).join(' ')).toContain('IPv6 address');
  });

  it('suggests system certificates on TLS verification failure', () => {
    const result = texts(facts({ isHttps: true, tls: { ok: false, errorCode: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' } }));
    expect(result.join(' ')).toContain('routiq.useVsCodeNetworking');
  });

  it('reports a healthy outcome when everything works', () => {
    const [only] = buildConclusions(facts({ attempts: [attempt('direct', true), attempt('vscode', true)] }));
    expect(only.severity).toBe('good');
  });
});

describe('report sections', () => {
  it('lists unresolved variables and redacts the URL', () => {
    expect(unresolvedPlaceholders('https://{{host}}/{{ id }}/{{host}}')).toEqual(['host', 'id']);
    const section = urlSection({ template: 'x', resolved: 'https://u:p@{{host}}/a?token=abc' });
    expect(section.status).toBe('fail');
    expect(section.lines.join('\n')).not.toContain('abc');
    expect(section.lines.join('\n')).toContain('Unresolved variables: host');
  });

  it('warns when the first resolved address is IPv6', () => {
    const section = dnsSection({ ok: true, addresses: [{ address: '::1', family: 6 }], timeMs: 2 }, 'h');
    expect(section.status).toBe('warn');
  });

  it('explains transport choice and Windows PAC limits without leaking proxy credentials', () => {
    const section = proxySection({
      routiqProxy: 'http://u:p@proxy:8080',
      vscodeProxy: '',
      proxySupport: 'override',
      useVsCodeNetworkingSetting: true,
      effectiveProxyUrl: 'http://u:p@proxy:8080',
      currentVariant: 'current',
      platform: 'win32',
      env: { HTTPS_PROXY: 'http://a:b@envproxy:1' },
    });
    const text = section.lines.join('\n');
    expect(text).toContain('routiq.proxy is set');
    expect(text).toContain('PAC');
    expect(text).not.toMatch(/u:p|a:b/);
  });

  it('formats TLS details and failure hint', () => {
    const section = tlsSection({ ok: false, subject: 'api', issuer: 'Corp CA', errorCode: 'SELF_SIGNED_CERT_IN_CHAIN' });
    expect(section.status).toBe('fail');
    expect(formatReport({ generatedAt: 'now', sections: [section], conclusions: [{ severity: 'hint', text: 'x' }] })).toContain('[FAIL] TLS');
  });
});
