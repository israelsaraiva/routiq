import { describe, expect, it } from 'vitest';
import { runScript } from './scriptSandbox';
import { translatePostmanScript } from './postmanScript';

const response = { status: 200, statusText: 'OK', timeMs: 5, headers: { 'x-a': '1' }, body: '{"id":7,"name":"abc"}' };
const request = { url: 'https://x.test', method: 'GET', headers: {}, body: '' };

function translated(source: string): string {
  return translatePostmanScript(source).code;
}

describe('translatePostmanScript', () => {
  it('maps variable access and response accessors', () => {
    const code = translated(
      [
        'pm.environment.set("id", pm.response.json().id);',
        'const t = pm.variables.get("t") + pm.collectionVariables.get("c");',
        'const c = pm.response.code, s = pm.response.status, h = pm.response.headers.get("X-A");',
      ].join('\n'),
    );
    expect(code).toContain('rq.variables.set("id", rq.response.json().id);');
    expect(code).toContain('rq.variables.get("t") + rq.variables.get("c")');
    expect(code).toContain('rq.response.status, s = rq.response.statusText, h = rq.response.header("X-A")');
  });

  it('maps chai assertions to rq matchers', () => {
    const code = translated(
      [
        'pm.expect(a).to.equal(1);',
        'pm.expect(a).to.eql({ b: 1 });',
        'pm.expect(a).to.include("x");',
        'pm.expect(a).to.be.above(2);',
        'pm.expect(a).to.not.equal(3);',
        'pm.expect(a).to.be.true;',
        'pm.response.to.have.status(201);',
      ].join('\n'),
    );
    expect(code.split('\n')).toEqual([
      'rq.expect(a).toBe(1);',
      'rq.expect(a).toEqual({ b: 1 });',
      'rq.expect(a).toContain("x");',
      'rq.expect(a).toBeGreaterThan(2);',
      'rq.expect(a).not.toBe(3);',
      'rq.expect(a).toBe(true);',
      'rq.expect(rq.response.status).toBe(201);',
    ]);
  });

  it('produces code that runs in the sandbox', async () => {
    const source = `
      pm.test("status", function () {
        pm.response.to.have.status(200);
        pm.expect(pm.response.json().name).to.equal("abc");
      });
      pm.environment.set("id", pm.response.json().id);
    `;
    const result = await runScript(translated(source), { variables: {}, request, response }, 1000);
    expect(result.tests).toEqual([{ name: 'status', passed: true }]);
    expect(result.variableChanges).toEqual({ id: '7' });
  });

  it('comments out untranslatable lines and counts them', () => {
    const translation = translatePostmanScript('pm.environment.set("a", 1);\npm.sendRequest("https://x", function () {});\npm.environment.unset("a");');
    expect(translation.untranslatedLines).toBe(2);
    expect(translation.code.split('\n')[1]).toBe('// [not translated] pm.sendRequest("https://x", function () {});');
    expect(translation.code.split('\n')[0]).toBe('rq.variables.set("a", 1);');
    expect(translation.commentedOutEntirely).toBe(false);
  });

  it('comments out the whole script when partial translation would not compile', () => {
    const translation = translatePostmanScript('pm.sendRequest("u", function (err, res) {\n  console.log(1);\n});');
    expect(translation.commentedOutEntirely).toBe(true);
    expect(translation.code.split('\n').every((line) => line.startsWith('// [not translated] '))).toBe(true);
  });
});
