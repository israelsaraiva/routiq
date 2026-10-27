import { describe, expect, it } from 'vitest';
import { Collection, RequestModel, ResponseModel } from '../shared/types';
import { parseOwnCollection } from './collectionFormat';
import { createCollection, createFolder, createRequest } from './factories';
import { serializeCollection } from './serialization';
import { buildGrpcRunResult, buildRunExport, buildRunResult, buildSkippedResult, collectRunnableRequests, normalizeDelayMs, summarizeRun } from './collectionRunner';
import { applyScriptRequest, applyVariableChanges, mergeScriptResults, toScriptRequest, toScriptResponse } from './scriptFlow';
import { emptyScriptResult } from './scriptSandbox';

function named(name: string, patch: Partial<RequestModel> = {}): RequestModel {
  return { ...createRequest(name), ...patch };
}

const okResponse: ResponseModel = { status: 200, statusText: 'OK', timeMs: 10, sizeBytes: 0, headers: [], body: '' };

describe('collectRunnableRequests', () => {
  it('orders depth first, records folder paths and marks streaming kinds as skipped', () => {
    const inner = { ...createFolder('Inner'), items: [named('c')] };
    const outer = { ...createFolder('Outer'), items: [named('b'), inner, named('socket', { kind: 'websocket' })] };
    const runnable = collectRunnableRequests([named('a'), outer, named('d')]);
    expect(runnable.map(({ request, path, mode }) => `${path}|${request.name}|${mode}`)).toEqual([
      '|a|http',
      'Outer|b|http',
      'Outer / Inner|c|http',
      'Outer|socket|skipped',
      '|d|http',
    ]);
  });

  it('runs grpc and graphql requests and skips sse and streaming http', () => {
    const modes = collectRunnableRequests([
      named('g', { kind: 'grpc' }),
      named('q', { kind: 'graphql' }),
      named('s', { kind: 'sse' }),
      named('h', { stream: true }),
    ]).map(({ mode }) => mode);
    expect(modes).toEqual(['grpc', 'http', 'skipped', 'skipped']);
  });
});

describe('buildRunResult and summarizeRun', () => {
  const runnable = { request: named('r'), path: '', mode: 'http' as const };

  it('fails when a test fails, a script errors or the request errors', () => {
    const passingTest = { tests: [{ name: 't', passed: true }], console: [], errors: [] };
    expect(buildRunResult(runnable, okResponse, passingTest).passed).toBe(true);
    expect(buildRunResult(runnable, okResponse, { ...passingTest, tests: [{ name: 't', passed: false }] }).passed).toBe(false);
    expect(buildRunResult(runnable, okResponse, { ...passingTest, errors: ['boom'] }).passed).toBe(false);
    expect(buildRunResult(runnable, { ...okResponse, error: 'refused' }, passingTest).passed).toBe(false);
  });

  it('summarizes requests and tests', () => {
    const good = buildRunResult(runnable, okResponse, { tests: [{ name: 'a', passed: true }], console: [], errors: [] });
    const bad = buildRunResult(runnable, okResponse, { tests: [{ name: 'b', passed: false }, { name: 'c', passed: true }], console: [], errors: [] });
    const skipped = buildSkippedResult({ request: named('s', { kind: 'sse' }), path: '', mode: 'skipped' });
    expect(summarizeRun([good, bad, skipped], 4, true, 1234)).toEqual({
      total: 4,
      executed: 2,
      skipped: 1,
      passed: 1,
      failed: 1,
      testsPassed: 2,
      testsFailed: 1,
      durationMs: 1234,
      stopped: true,
    });
  });
});

describe('buildGrpcRunResult', () => {
  const runnable = { request: named('g', { kind: 'grpc' }), path: '', mode: 'grpc' as const };
  const outcome = { statusCode: 0, statusName: 'OK', details: '', timeMs: 5, messages: ['{"a":1}'], messagesCapped: false };

  it('passes on OK and keeps the recorded messages', () => {
    const result = buildGrpcRunResult(runnable, outcome);
    expect(result).toMatchObject({ passed: true, statusText: 'OK', messages: ['{"a":1}'], method: 'gRPC' });
  });

  it('fails on a non-OK status unless the run was capped by the runner', () => {
    const unavailable = { ...outcome, statusCode: 14, statusName: 'UNAVAILABLE', details: 'down' };
    expect(buildGrpcRunResult(runnable, unavailable)).toMatchObject({ passed: false, error: 'UNAVAILABLE: down' });
    expect(buildGrpcRunResult(runnable, { ...unavailable, statusCode: 1, statusName: 'CANCELLED', messagesCapped: true }).passed).toBe(true);
  });
});

describe('buildRunExport', () => {
  it('wraps summary and results with an ISO timestamp', () => {
    const summary = summarizeRun([], 0, false, 0);
    expect(buildRunExport('Run', summary, [], new Date('2026-01-02T03:04:05Z'))).toEqual({ title: 'Run', exportedAt: '2026-01-02T03:04:05.000Z', summary, results: [] });
  });
});

describe('normalizeDelayMs', () => {
  it('clamps invalid values to zero', () => {
    expect(normalizeDelayMs(-5)).toBe(0);
    expect(normalizeDelayMs('x')).toBe(0);
    expect(normalizeDelayMs(250.9)).toBe(250);
  });
});

describe('script request mapping', () => {
  const request = named('r', {
    method: 'GET',
    url: 'http://x',
    headers: [
      { key: 'A', value: '1', enabled: true },
      { key: 'Off', value: '2', enabled: false },
    ],
  });

  it('exposes only enabled headers and applies mutations while keeping disabled ones', () => {
    const scripted = toScriptRequest(request);
    expect(scripted.headers).toEqual({ A: '1' });
    const applied = applyScriptRequest(request, { ...scripted, method: 'post', headers: { B: '3' }, body: 'x' });
    expect(applied.method).toBe('POST');
    expect(applied.headers).toEqual([
      { key: 'B', value: '3', enabled: true },
      { key: 'Off', value: '2', enabled: false },
    ]);
    expect(applied.body.text).toBe('x');
    expect(applyScriptRequest(request, { ...scripted, method: 'bogus' }).method).toBe('GET');
  });

  it('lowercases and joins response headers', () => {
    const scripted = toScriptResponse({ ...okResponse, headers: [['Set-Cookie', 'a'], ['set-cookie', 'b']] });
    expect(scripted.headers).toEqual({ 'set-cookie': 'a, b' });
  });
});

describe('mergeScriptResults', () => {
  it('labels errors by phase', () => {
    const merged = mergeScriptResults([
      { phase: 'pre-request', result: { ...emptyScriptResult(), error: 'bad' } },
      { phase: 'post-response', result: { ...emptyScriptResult(), tests: [{ name: 't', passed: true }] } },
    ]);
    expect(merged.errors).toEqual(['pre-request script: bad']);
    expect(merged.tests).toHaveLength(1);
  });
});

describe('applyVariableChanges', () => {
  const base: Collection = {
    id: 'c',
    name: 'c',
    items: [],
    variables: [{ key: 'a', value: '1', enabled: true }],
    environments: [{ id: 'e', name: 'dev', variables: [{ key: 'x', value: '0', enabled: false }] }],
  };

  it('writes into base variables without an active environment', () => {
    const next = applyVariableChanges(base, { a: '2', b: '3' });
    expect(next.variables).toEqual([
      { key: 'a', value: '2', enabled: true },
      { key: 'b', value: '3', enabled: true },
    ]);
    expect(next.environments).toBe(base.environments);
  });

  it('writes into the active environment and re-enables updated variables', () => {
    const next = applyVariableChanges({ ...base, activeEnvironmentId: 'e' }, { x: '9' });
    expect(next.environments[0].variables).toEqual([{ key: 'x', value: '9', enabled: true }]);
    expect(next.variables).toBe(base.variables);
  });

  it('never writes script values into secret variables', () => {
    const secret = { ...base, variables: [{ key: 'a', value: '', enabled: true, secret: true }] };
    expect(applyVariableChanges(secret, { a: 'leak' }).variables).toEqual(secret.variables);
  });

  it('returns the same collection when nothing changed', () => {
    expect(applyVariableChanges(base, {})).toBe(base);
  });
});

describe('script persistence', () => {
  it('round-trips request scripts through the collection file format', () => {
    const collection = { ...createCollection('c'), items: [named('r', { scripts: { pre: 'a()', post: 'b()' } }), named('plain')] };
    const parsed = parseOwnCollection(JSON.parse(serializeCollection(collection)), (id) => String(id));
    expect(parsed.items.map((entry) => ('scripts' in entry ? entry.scripts : undefined))).toEqual([{ pre: 'a()', post: 'b()' }, undefined]);
  });
});
