import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { prepareRequest } from '../../../core/requestBuilder';
import { createRequest } from '../../../core/factories';
import { SCRIPTS_NOT_CONFIRMED_REASON } from '../../../core/scriptConsent';
import { CookieStore } from '../../../extension/cookieStore';
import { ScriptPermission } from '../../../extension/scriptConsent';
import { ScriptedExchange, ScriptedSender } from '../../../extension/scriptedSender';
import { SecretVault } from '../../../extension/secretVault';
import { Collection, RequestModel } from '../../../shared/types';
import { InMemorySecrets } from '../inMemorySecrets';
import { LocalServer, startLocalServer } from '../localServer';
import { StorageHarness, createStorageHarness } from '../storageHarness';

const prepareForSend = (request: RequestModel, variables: Record<string, string>) => Promise.resolve(prepareRequest(request, variables));
const DENY_ALL: ScriptPermission = { check: () => Promise.resolve({ allowed: false, reason: SCRIPTS_NOT_CONFIRMED_REASON }) };

describe('script isolation', () => {
  let server: LocalServer;
  let harness: StorageHarness;
  let collection: Collection;
  let vault: SecretVault;
  let sender: ScriptedSender;

  before(async () => {
    server = await startLocalServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    harness = await createStorageHarness('script-isolation');
    collection = harness.storage.addCollection('Isolation');
    vault = new SecretVault(new InMemorySecrets());
    sender = new ScriptedSender(harness.storage, new CookieStore(harness.globalStorage), vault);
  });

  afterEach(async () => {
    harness.storage.dispose();
    vault.dispose();
    await vscode.workspace.getConfiguration('routiq').update('scripts.timeoutMs', undefined, vscode.ConfigurationTarget.Global);
  });

  function sendWithScripts(pre: string, post = '', permissionSender = sender, signal?: AbortSignal): Promise<ScriptedExchange> {
    const request = { ...createRequest('Req'), url: `${server.baseUrl}/ok`, scripts: { pre, post } };
    harness.storage.addRequestFrom(collection.id, request);
    return permissionSender.send(request.id, request, prepareForSend, signal);
  }

  async function setScriptTimeout(timeoutMs: number): Promise<void> {
    await vscode.workspace.getConfiguration('routiq').update('scripts.timeoutMs', timeoutMs, vscode.ConfigurationTarget.Global);
  }

  it('terminates an infinite loop and still sends the request', async () => {
    await setScriptTimeout(300);
    const startedAt = Date.now();
    const { response } = await sendWithScripts('while (true) {}');
    assert.ok(Date.now() - startedAt < 5000);
    assert.strictEqual(response.status, 200);
    assert.ok(response.scripts?.errors.some((error) => /timed out/i.test(error)));
  });

  it('survives a memory blowup and keeps the host alive', async () => {
    const { response } = await sendWithScripts('', 'const hoard = []; while (true) { hoard.push(new Array(100000).fill(1)); }');
    assert.strictEqual(response.status, 200);
    assert.ok(response.scripts?.errors.some((error) => /memory limit/i.test(error)));
  });

  it('cannot reach process, require or the constructor chain', async () => {
    const script = `
      rq.test('no process', () => rq.expect(typeof process).toBe('undefined'));
      rq.test('no require', () => rq.expect(typeof require).toBe('undefined'));
      rq.test('constructor escape fails', () => { this.constructor.constructor('return process')(); });
    `;
    const { response } = await sendWithScripts(script);
    const outcomes = Object.fromEntries((response.scripts?.tests ?? []).map((test) => [test.name, test.passed]));
    assert.deepStrictEqual(outcomes, { 'no process': true, 'no require': true, 'constructor escape fails': false });
  });

  it('does not run scripts when permission is denied', async () => {
    const guarded = new ScriptedSender(harness.storage, new CookieStore(harness.globalStorage), vault, DENY_ALL);
    const { response } = await sendWithScripts(`rq.variables.set('ran', 'yes')`, '', guarded);
    assert.strictEqual(response.status, 200);
    assert.ok(response.scripts?.errors.some((error) => error.includes(SCRIPTS_NOT_CONFIRMED_REASON)));
    const variables = harness.storage.getCollection(collection.id)?.variables ?? [];
    assert.ok(!variables.some((variable) => variable.key === 'ran'));
  });

  it('aborts the in-flight request and script when the signal fires', async () => {
    const controller = new AbortController();
    const request = { ...createRequest('Slow'), url: `${server.baseUrl}/slow` };
    harness.storage.addRequestFrom(collection.id, request);
    const pending = sender.send(request.id, request, prepareForSend, controller.signal);
    setTimeout(() => controller.abort(), 100);
    const startedAt = Date.now();
    const { response } = await pending;
    assert.ok(Date.now() - startedAt < 3000);
    assert.match(response.error ?? '', /aborted/i);
  });
});
