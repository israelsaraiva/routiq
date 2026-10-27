import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiagnosisReport } from '../core/networkDiagnosis';
import { DiagnosisEnvironment, diagnoseNetwork } from './networkDiagnoser';

let server: Server;
let port: number;

function handle(request: IncomingMessage, response: ServerResponse): void {
  if (request.url === '/') {
    response.writeHead(302, { Location: '/next' }).end();
  }
}

function environment(overrides: Partial<DiagnosisEnvironment['network']> = {}): DiagnosisEnvironment {
  return {
    network: { followRedirects: true, maxRedirects: 5, rejectUnauthorized: true, useVsCodeNetworking: true, connectTimeoutMs: 300, ...overrides },
    timeoutMs: 400,
    platform: 'linux',
    proxy: { routiqProxy: '', vscodeProxy: '', proxySupport: 'override', useVsCodeNetworkingSetting: true, env: {} },
  };
}

function run(url: string, useRealRequest = false, env = environment()): Promise<DiagnosisReport> {
  return diagnoseNetwork({ url: { template: url, resolved: url }, prepared: { url, method: 'POST', headers: {}, body: '{}' }, useRealRequest }, env);
}

const sectionText = (report: DiagnosisReport, title: string): string => report.sections.find((entry) => entry.title === title)?.lines.join('\n') ?? '';
const conclusionText = (report: DiagnosisReport): string => report.conclusions.map((entry) => entry.text).join('\n');

beforeEach(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('diagnoseNetwork', () => {
  it('reports a healthy host and treats a redirect as a response', async () => {
    const report = await run(`http://localhost:${port}/path?token=secret`);
    expect(sectionText(report, 'DNS')).toContain('Resolved localhost');
    expect(sectionText(report, 'TCP connect (direct)')).toContain('connected');
    expect(sectionText(report, 'HTTP attempts')).toContain('HTTP 302');
    expect(sectionText(report, 'URL')).not.toContain('secret');
    expect(report.conclusions.map((entry) => entry.severity)).not.toContain('problem');
  });

  it('reports a response timeout when the server accepts but never answers', async () => {
    server.removeAllListeners('request');
    server.on('request', () => undefined);
    const report = await run(`http://127.0.0.1:${port}/`);
    expect(sectionText(report, 'HTTP attempts')).toContain('response-timeout');
    expect(conclusionText(report)).toContain('no HTTP response arrives on any transport');
  });

  it('reports a refused connection on a closed port', async () => {
    await new Promise((resolve) => server.close(resolve));
    const report = await run(`http://127.0.0.1:${port}/`);
    expect(sectionText(report, 'TCP connect (direct)')).toContain('refused');
    expect(sectionText(report, 'HTTP attempts')).toContain('ECONNREFUSED');
    server = createServer();
  });

  it('only sends the real method and body when asked', async () => {
    const methods: string[] = [];
    server.removeAllListeners('request');
    server.on('request', (request, response) => {
      methods.push(request.method ?? '');
      response.writeHead(200).end();
    });
    await run(`http://127.0.0.1:${port}/`);
    expect(methods).not.toContain('POST');
    const report = await run(`http://127.0.0.1:${port}/`, true);
    expect(methods).toContain('POST');
    expect(sectionText(report, 'HTTP attempts')).toContain('real POST request');
  });

  it('checks the proxy separately and names it in the report', async () => {
    const proxy = createServer();
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const proxyUrl = `http://user:pw@127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    const report = await run(`http://127.0.0.1:${port}/`, false, environment({ proxyUrl, useVsCodeNetworking: false }));
    expect(sectionText(report, 'TCP connect (proxy)')).toContain('connected');
    expect(JSON.stringify(report)).not.toContain('pw@');
    proxy.close();
  });

  it('rejects non-http URLs without probing', async () => {
    const report = await run('ftp://host/x');
    expect(report.conclusions[0].severity).toBe('problem');
  });
});
