import * as assert from 'node:assert';
import { createRequest } from '../../../core/factories';
import { StreamSession } from '../../../extension/streamSession';
import { RequestModel, StreamHostMessage } from '../../../shared/types';
import { LocalServer, startLocalServer } from '../localServer';
import { waitFor } from '../waiting';

describe('streaming requests', () => {
  let server: LocalServer;
  let messages: StreamHostMessage[];
  let session: StreamSession;

  before(async () => {
    server = await startLocalServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(() => {
    messages = [];
    session = new StreamSession((message) => messages.push(message), () => ({}));
  });

  afterEach(() => session.dispose());

  const statuses = () => messages.flatMap((message) => (message.type === 'streamStatus' ? [message.status] : []));
  const sseEvents = () => messages.flatMap((message) => (message.type === 'sseEvent' ? [message.entry.event] : []));
  const socketTexts = (direction: 'sent' | 'received') =>
    messages.flatMap((message) => (message.type === 'wsMessage' && message.entry.direction === direction ? [message.entry.text] : []));

  function streamRequest(kind: 'sse' | 'websocket', url: string, overrides: Partial<RequestModel> = {}): RequestModel {
    return { ...createRequest('Stream', undefined, kind), url, ...overrides };
  }

  it('receives parsed server-sent events and reports the stream end', async () => {
    session.connect(streamRequest('sse', `${server.baseUrl}/sse`));
    await waitFor(() => statuses().includes('closed') || undefined, 'SSE stream to end');
    assert.deepStrictEqual(statuses().slice(0, 2), ['connecting', 'open']);
    const events = sseEvents();
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].event, 'greeting');
    assert.strictEqual(events[0].data, 'hello');
    assert.strictEqual(events[1].data, 'line one\nline two');
    assert.strictEqual(events[2].data, 'last');
  });

  it('reports an error for a non-2xx SSE response', async () => {
    session.connect(streamRequest('sse', `${server.baseUrl}/sse-forbidden`));
    await waitFor(() => statuses().includes('error') || undefined, 'SSE error status');
    const failure = messages.find((message) => message.type === 'streamStatus' && message.status === 'error');
    assert.match((failure as { detail?: string }).detail ?? '', /403/);
  });

  it('exchanges WebSocket messages and closes cleanly', async () => {
    session.connect(streamRequest('websocket', server.webSocketUrl));
    await waitFor(() => socketTexts('received').includes('welcome') || undefined, 'welcome message');
    session.send('ping');
    await waitFor(() => socketTexts('received').includes('echo:ping') || undefined, 'echoed message');
    assert.deepStrictEqual(socketTexts('sent'), ['ping']);
    session.disconnect();
    assert.strictEqual(statuses()[statuses().length - 1], 'closed');
  });

  it('negotiates WebSocket subprotocols', async () => {
    session.connect(streamRequest('websocket', server.webSocketUrl, { subprotocols: 'chat, superchat' }));
    const open = await waitFor(
      () => messages.find((message) => message.type === 'streamStatus' && message.status === 'open') as { detail?: string } | undefined,
      'open WebSocket',
    );
    assert.strictEqual(open.detail, 'Subprotocol: chat');
  });

  it('reports a WebSocket connection failure', async () => {
    session.connect(streamRequest('websocket', 'ws://127.0.0.1:1/ws'));
    await waitFor(() => statuses().includes('error') || undefined, 'WebSocket error');
  });

  it('refuses to send while disconnected', () => {
    session.send('nobody home');
    assert.deepStrictEqual(statuses(), ['error']);
  });
});
