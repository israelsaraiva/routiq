import { describe, expect, it } from 'vitest';
import { createRequest } from './factories';
import { parseOwnCollection } from './collectionFormat';
import { describeRequest, isStreamingRequest, requestKindOf, toWebSocketUrl, usesEventLog } from './requestKinds';
import { parseSubprotocols, prepareStream } from './streamPreparation';
import { serializeCollection } from './serialization';
import { createCollection } from './factories';

describe('request kinds', () => {
  it('defaults legacy requests to http and does not stream them', () => {
    const request = createRequest('R', () => 'r1');
    expect(requestKindOf(request)).toBe('http');
    expect(isStreamingRequest(request)).toBe(false);
    expect(describeRequest(request)).toBe('GET');
  });

  it('treats sse, websocket and stream-mode http as streaming', () => {
    expect(isStreamingRequest(createRequest('S', () => 's', 'sse'))).toBe(true);
    expect(isStreamingRequest(createRequest('W', () => 'w', 'websocket'))).toBe(true);
    const streamedHttp = { ...createRequest('H', () => 'h'), stream: true };
    expect(isStreamingRequest(streamedHttp)).toBe(true);
    expect(usesEventLog(streamedHttp)).toBe(true);
    expect(usesEventLog(createRequest('W', () => 'w', 'websocket'))).toBe(false);
  });

  it('maps http urls to websocket urls', () => {
    expect(toWebSocketUrl('https://x.io/a')).toBe('wss://x.io/a');
    expect(toWebSocketUrl('http://x.io/a')).toBe('ws://x.io/a');
    expect(toWebSocketUrl('wss://x.io/a')).toBe('wss://x.io/a');
  });

  it('splits and substitutes subprotocols', () => {
    expect(parseSubprotocols('graphql-ws, {{proto}}', { proto: 'chat' })).toEqual(['graphql-ws', 'chat']);
  });

  it('prepares streams with variables, query params, auth and sse accept header', () => {
    const request = {
      ...createRequest('S', () => 's', 'sse'),
      url: '{{host}}/events',
      params: [{ key: 'topic', value: '{{topic}}', enabled: true }],
      auth: { type: 'bearer' as const, token: '{{token}}' },
    };
    const prepared = prepareStream(request, { host: 'https://api.test', topic: 'a', token: 't' });
    expect(prepared.url).toBe('https://api.test/events?topic=a');
    expect(prepared.headers.Accept).toBe('text/event-stream');
    expect(prepared.headers.Authorization).toContain('t');
  });

  it('prepares websocket streams with ws scheme, headers and subprotocols', () => {
    const request = {
      ...createRequest('W', () => 'w', 'websocket'),
      url: 'https://{{host}}/socket',
      headers: [{ key: 'X-Key', value: '{{key}}', enabled: true }],
      subprotocols: 'a b',
    };
    expect(prepareStream(request, { host: 'h.io', key: 'k' })).toEqual({
      url: 'wss://h.io/socket',
      headers: { 'X-Key': 'k' },
      subprotocols: ['a', 'b'],
    });
  });

  it('round-trips kind fields and omits them for plain http requests', () => {
    const collection = createCollection('C', () => 'c');
    collection.items.push(
      { ...createRequest('W', () => 'w', 'websocket'), subprotocols: 'chat', autoReconnect: true },
      createRequest('H', () => 'h'),
    );
    const text = serializeCollection(collection);
    const parsed = parseOwnCollection(JSON.parse(text), (id) => String(id));
    expect(parsed.items[0]).toMatchObject({ kind: 'websocket', subprotocols: 'chat', autoReconnect: true });
    expect(text.match(/"kind"/g)).toHaveLength(1);
    expect(parsed.items[1]).not.toHaveProperty('kind');
  });
});

describe('grpc request kind', () => {
  it('is labelled, streaming and not event-log based', () => {
    const request = createRequest('G', () => 'g', 'grpc');
    expect(describeRequest(request)).toBe('gRPC');
    expect(isStreamingRequest(request)).toBe(true);
    expect(usesEventLog(request)).toBe(false);
  });

  it('round-trips grpc config and keeps legacy requests free of it', () => {
    const collection = createCollection('C', () => 'c');
    const grpcRequest = createRequest('G', () => 'g', 'grpc');
    grpcRequest.grpc = { tls: true, protoFiles: ['/a.proto'], importPaths: ['/inc'], service: 'demo.Greeter', method: 'Hello' };
    collection.items.push(grpcRequest, createRequest('H', () => 'h'));
    const text = serializeCollection(collection);
    const restored = parseOwnCollection(JSON.parse(text), () => 'x');
    const [grpcRestored, httpRestored] = restored.items as ReturnType<typeof createRequest>[];
    expect(grpcRestored.kind).toBe('grpc');
    expect(grpcRestored.grpc).toEqual(grpcRequest.grpc);
    expect(httpRestored.grpc).toBeUndefined();
  });
});
