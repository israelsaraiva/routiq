import { describe, expect, it } from 'vitest';
import { ScriptInput, describeWorkerError, runScript } from './scriptSandbox';

const baseInput: ScriptInput = {
  variables: { token: 'abc' },
  request: { url: 'https://x.test/{{id}}', method: 'GET', headers: { Accept: 'text/plain' }, body: '' },
  response: { status: 201, statusText: 'Created', timeMs: 12, headers: { 'content-type': 'application/json' }, body: '{"id":7,"tags":["a","b"]}' },
};

function run(source: string, input: ScriptInput = baseInput, timeoutMs = 1000) {
  return runScript(source, input, timeoutMs);
}

describe('runScript variables', () => {
  it('reads existing variables and records writes as strings', async () => {
    const result = await run(`rq.variables.set('seen', rq.variables.get('token')); rq.variables.set('n', 5);`);
    expect(result.variableChanges).toEqual({ seen: 'abc', n: '5' });
    expect(result.error).toBeUndefined();
  });

  it('chains a value out of the response', async () => {
    const result = await run(`rq.variables.set('id', rq.response.json().id);`);
    expect(result.variableChanges).toEqual({ id: '7' });
  });
});

describe('runScript request and response', () => {
  it('returns request mutations', async () => {
    const result = await run(`rq.request.url += '?x=1'; rq.request.method = 'POST'; rq.request.headers['X-A'] = '1'; rq.request.body = 'hi';`);
    expect(result.request).toEqual({
      url: 'https://x.test/{{id}}?x=1',
      method: 'POST',
      headers: { Accept: 'text/plain', 'X-A': '1' },
      body: 'hi',
    });
  });

  it('exposes response fields', async () => {
    const result = await run(`
      console.log(rq.response.status, rq.response.header('Content-Type'), rq.response.text().length);
    `);
    expect(result.console).toEqual([{ level: 'log', text: '201 application/json 25' }]);
  });
});

describe('runScript tests and assertions', () => {
  it('records passing and failing tests', async () => {
    const result = await run(`
      rq.test('status', () => rq.expect(rq.response.status).toBe(201));
      rq.test('wrong', () => rq.expect(rq.response.status).toBe(200));
      rq.test('negated', () => rq.expect(rq.response.json().tags).not.toContain('z'));
      rq.test('throws', () => { throw new Error('boom'); });
    `);
    expect(result.tests).toEqual([
      { name: 'status', passed: true },
      { name: 'wrong', passed: false, message: 'expected 201 to be 200' },
      { name: 'negated', passed: true },
      { name: 'throws', passed: false, message: 'boom' },
    ]);
  });

  it('settles promise based tests within the same run', async () => {
    const result = await run(`
      rq.test('async ok', () => Promise.resolve().then(() => rq.expect(1).toBe(1)));
      rq.test('async bad', () => Promise.resolve().then(() => rq.expect(1).toBe(2)));
    `);
    expect(result.tests.map((test) => test.passed)).toEqual([true, false]);
  });
});

describe('runScript console', () => {
  it('captures levels and formats objects', async () => {
    const result = await run(`console.warn('w'); console.error({a:1}); console.info('i', 2);`);
    expect(result.console).toEqual([
      { level: 'warn', text: 'w' },
      { level: 'error', text: '{"a":1}' },
      { level: 'info', text: 'i 2' },
    ]);
  });
});

describe('runScript sandbox restrictions', () => {
  it('has no require, process or module access', async () => {
    const result = await run(`
      rq.variables.set('types', [typeof require, typeof process, typeof module, typeof setTimeout, typeof fetch].join(','));
    `);
    expect(result.variableChanges.types).toBe('undefined,undefined,undefined,undefined,undefined');
  });

  it('cannot reach host globals through constructors', async () => {
    const result = await run(`
      const escape = rq.test.constructor('return typeof process');
      rq.variables.set('escape', String(escape()));
    `);
    expect(result.error ?? result.variableChanges.escape).not.toBe('object');
  });

  it('blocks string evaluation', async () => {
    expect((await run(`eval('1+1')`)).error).toBeDefined();
    expect((await run(`new Function('return 1')()`)).error).toBeDefined();
  });

  it('aborts infinite loops with an error', async () => {
    const result = await run('while (true) {}', baseInput, 100);
    expect(result.error).toMatch(/timed out/i);
  });

  it('aborts infinite loops inside promise callbacks', async () => {
    const result = await run('Promise.resolve().then(() => { while (true) {} });', baseInput, 100);
    expect(result.error).toMatch(/timed out/i);
  });

  it('reports syntax and runtime errors and keeps earlier output', async () => {
    expect((await run('let = ;')).error).toBeDefined();
    const result = await run(`rq.variables.set('a','1'); console.log('before'); undefinedFunction();`);
    expect(result.error).toMatch(/undefinedFunction/);
    expect(result.variableChanges).toEqual({ a: '1' });
    expect(result.console).toHaveLength(1);
  });

  it('skips empty scripts', async () => {
    expect((await run('  ')).request).toEqual(baseInput.request);
  });
});

describe('runScript isolation', () => {
  it('stops a runaway allocation without crashing the host', async () => {
    const result = await run('const hoard = []; while (true) { hoard.push(new Array(100000).fill(1)); }', baseInput, 10000);
    expect(result.error).toMatch(/memory limit/i);
  });

  it('cannot reach the worker through the constructor chain', async () => {
    const result = await run(`rq.variables.set('leak', String(this.constructor.constructor('return process')()));`);
    expect(result.variableChanges.leak).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it('cannot import modules dynamically', async () => {
    const result = await run(`import('node:fs').then(() => rq.variables.set('leak', '1'));`);
    expect(result.variableChanges.leak).toBeUndefined();
  });

  it('keeps the rq api immutable', async () => {
    const result = await run(`'use strict'; rq.test = null;`);
    expect(result.error).toBeDefined();
  });

  it('aborts a running script when the signal fires', async () => {
    const controller = new AbortController();
    const pending = runScript('while (true) {}', baseInput, 10000, controller.signal);
    setTimeout(() => controller.abort(), 50);
    expect((await pending).error).toMatch(/aborted/i);
  });

  it('does not start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await runScript('rq.variables.set("a","1")', baseInput, 1000, controller.signal)).variableChanges).toEqual({});
  });

  it('maps worker out-of-memory errors to a readable message', () => {
    expect(describeWorkerError(Object.assign(new Error('x'), { code: 'ERR_WORKER_OUT_OF_MEMORY' }))).toMatch(/memory limit/);
    expect(describeWorkerError(new Error('plain'))).toBe('plain');
  });
});
