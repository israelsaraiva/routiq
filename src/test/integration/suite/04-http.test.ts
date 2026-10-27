import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { prepareRequest } from '../../../core/requestBuilder';
import { createRequest } from '../../../core/factories';
import { CookieStore } from '../../../extension/cookieStore';
import { HistoryStore } from '../../../extension/historyStore';
import { RequestPanels } from '../../../extension/requestPanels';
import { ScriptedSender, ScriptedExchange } from '../../../extension/scriptedSender';
import { SecretVault } from '../../../extension/secretVault';
import { Storage } from '../../../extension/storage';
import { Collection, RequestModel } from '../../../shared/types';
import { InMemorySecrets } from '../inMemorySecrets';
import { LocalServer, startLocalServer } from '../localServer';
import { scratchRoot } from '../scratch';
import { StorageHarness, createStorageHarness, useStoragePath } from '../storageHarness';
import { waitFor } from '../waiting';

const prepareForSend = (request: RequestModel, variables: Record<string, string>) => Promise.resolve(prepareRequest(request, variables));

describe('sending requests', () => {
  let server: LocalServer;
  let harness: StorageHarness;
  let collection: Collection;
  let cookies: CookieStore;
  let vault: SecretVault;
  let sender: ScriptedSender;
  const settings = () => vscode.workspace.getConfiguration('routiq');

  before(async () => {
    server = await startLocalServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    harness = await createStorageHarness('http');
    collection = harness.storage.addCollection('HTTP');
    cookies = new CookieStore(harness.globalStorage);
    vault = new SecretVault(new InMemorySecrets());
    sender = new ScriptedSender(harness.storage, cookies, vault);
  });

  afterEach(async () => {
    harness.storage.dispose();
    vault.dispose();
    await settings().update('followRedirects', undefined, vscode.ConfigurationTarget.Global);
    await useStoragePath(join(scratchRoot(), 'configured-storage'));
  });

  function addRequest(overrides: Partial<RequestModel>): RequestModel {
    const request = { ...createRequest('Req'), ...overrides };
    harness.storage.addRequestFrom(collection.id, request);
    return request;
  }

  function send(request: RequestModel): Promise<ScriptedExchange> {
    return sender.send(request.id, request, prepareForSend);
  }

  it('returns status, headers and body', async () => {
    const { response } = await send(addRequest({ url: `${server.baseUrl}/ok` }));
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.statusText, 'OK');
    assert.strictEqual(response.body, '{"ok":true}');
    assert.ok(response.headers.some(([name, value]) => name === 'x-test' && value === 'yes'));
    assert.strictEqual(response.error, undefined);
  });

  it('sends method, headers, query params and body', async () => {
    const request = addRequest({
      method: 'POST',
      url: `${server.baseUrl}/echo`,
      params: [{ key: 'q', value: 'a b', enabled: true }],
      headers: [{ key: 'X-Custom', value: 'v1', enabled: true }],
      body: { type: 'json', text: '{"n":1}', form: [] },
    });
    const { response } = await send(request);
    const echoed = JSON.parse(response.body);
    assert.strictEqual(echoed.method, 'POST');
    assert.strictEqual(echoed.url, '/echo?q=a%20b');
    assert.strictEqual(echoed.headers['x-custom'], 'v1');
    assert.strictEqual(echoed.headers['content-type'], 'application/json');
    assert.strictEqual(echoed.body, '{"n":1}');
  });

  it('follows redirects by default and reports the count', async () => {
    const { response } = await send(addRequest({ url: `${server.baseUrl}/redirect` }));
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body, '{"ok":true}');
    assert.strictEqual(response.timing?.redirects, 1);
  });

  it('returns the 3xx response when followRedirects is disabled', async () => {
    await settings().update('followRedirects', false, vscode.ConfigurationTarget.Global);
    const { response } = await send(addRequest({ url: `${server.baseUrl}/redirect` }));
    assert.strictEqual(response.status, 302);
    assert.ok(response.headers.some(([name, value]) => name === 'location' && value === '/ok'));
  });

  it('persists cookies per collection across requests and CookieStore instances', async () => {
    await send(addRequest({ url: `${server.baseUrl}/set-cookie` }));
    const echoRequest = addRequest({ url: `${server.baseUrl}/echo` });
    const first = JSON.parse((await send(echoRequest)).response.body);
    assert.ok(String(first.headers.cookie).includes('sid=abc123'));

    await waitFor(async () => (await new CookieStore(harness.globalStorage).list(collection.id)).find((cookie) => cookie.name === 'sid'), 'cookie file');
    sender = new ScriptedSender(harness.storage, new CookieStore(harness.globalStorage), vault);
    const second = JSON.parse((await send(echoRequest)).response.body);
    assert.ok(String(second.headers.cookie).includes('sid=abc123'));
  });

  it('reports a timeout error', async () => {
    const { response } = await send(addRequest({ url: `${server.baseUrl}/slow`, timeoutMs: 200 }));
    assert.strictEqual(response.status, 0);
    assert.match(response.error ?? '', /timed out after 200 ms/);
  });

  it('reports a connection failure', async () => {
    const { response } = await send(addRequest({ url: 'http://127.0.0.1:1/unreachable' }));
    assert.strictEqual(response.status, 0);
    assert.ok(response.error);
  });

  it('substitutes collection and active environment variables', async () => {
    harness.storage.applyEnvironmentsDraft(collection.id, {
      variables: [
        { key: 'host', value: server.baseUrl, enabled: true },
        { key: 'who', value: 'collection', enabled: true },
      ],
      environments: [{ id: 'env-1', name: 'Staging', variables: [{ key: 'who', value: 'staging', enabled: true }, { key: 'token', value: 't-123', enabled: true }] }],
      activeEnvironmentId: 'env-1',
    });
    const request = addRequest({
      url: '{{host}}/echo?who={{who}}',
      headers: [{ key: 'Authorization', value: 'Bearer {{token}}', enabled: true }],
    });
    const echoed = JSON.parse((await send(request)).response.body);
    assert.strictEqual(echoed.url, '/echo?who=staging');
    assert.strictEqual(echoed.headers.authorization, 'Bearer t-123');
  });

  it('runs pre-request and post-response scripts and persists variable changes', async () => {
    const request = addRequest({
      url: `${server.baseUrl}/echo`,
      scripts: {
        pre: `rq.request.headers['X-From-Script'] = 'pre'; rq.variables.set('stage', 'sent');`,
        post: `rq.test('status is 200', () => rq.expect(rq.response.status).toBe(200));
               rq.variables.set('echoedMethod', rq.response.json().method);
               console.log('done');`,
      },
    });
    const { response } = await send(request);
    assert.strictEqual(JSON.parse(response.body).headers['x-from-script'], 'pre');
    assert.deepStrictEqual(response.scripts?.tests, [{ name: 'status is 200', passed: true }]);
    assert.ok(response.scripts?.console.some((entry) => entry.text === 'done'));

    const stored = harness.storage.getCollection(collection.id);
    const variables = Object.fromEntries((stored?.variables ?? []).map((variable) => [variable.key, variable.value]));
    assert.strictEqual(variables.stage, 'sent');
    assert.strictEqual(variables.echoedMethod, 'GET');
  });

  it('records a history entry when a request is executed through the panels', async () => {
    const history = new HistoryStore(harness.globalStorage);
    const panels = new RequestPanels(vscode.Uri.file(scratchRoot()), harness.storage, history, cookies, vault);
    const posted: unknown[] = [];
    const stubPanel = { webview: { postMessage: async (message: unknown) => void posted.push(message) } };
    const request = addRequest({ url: `${server.baseUrl}/ok`, headers: [{ key: 'X-H', value: '1', enabled: true }] });

    await (panels as unknown as { execute(id: string, panel: unknown, request: RequestModel): Promise<void> }).execute(request.id, stubPanel, request);

    const entries = await history.list(request.id);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].status, 200);
    assert.strictEqual(entries[0].url, `${server.baseUrl}/ok`);
    assert.strictEqual(entries[0].responseBody, '{"ok":true}');
    assert.ok(entries[0].requestHeaders.some(([name, value]) => name === 'X-H' && value === '1'));
    assert.ok(posted.some((message) => (message as { type: string }).type === 'response'));
    assert.ok(posted.some((message) => (message as { type: string }).type === 'historyList'));
    panels.dispose();
  });
});
