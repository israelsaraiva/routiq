import * as path from 'node:path';
import * as protoLoader from '@grpc/proto-loader';
import { beforeAll, describe, expect, it } from 'vitest';
import { GrpcServiceDescription } from '../shared/types';
import { allowsComposer, describeCallShape, parseMethodKey, methodKey, shouldReplaceMessage, addUniquePath, removePathAt } from './grpcConfig';
import { ProtoDefinitions, describeServices } from './grpcDescribe';
import { grpcStatusName, normalizeGrpcTarget, prepareGrpcCall } from './grpcPreparation';
import { createRequest } from './factories';

const PROTO_PATH = path.join(__dirname, 'testdata', 'greeter.proto');

describe('grpc method description', () => {
  let services: GrpcServiceDescription[];

  beforeAll(async () => {
    const definitions = await protoLoader.load(PROTO_PATH, { keepCase: true });
    services = describeServices(definitions as unknown as ProtoDefinitions);
  });

  it('lists services and methods with streaming flags', () => {
    expect(services.map((service) => service.name)).toEqual(['demo.Greeter']);
    const flags = Object.fromEntries(services[0].methods.map((method) => [method.name, [method.requestStream, method.responseStream]]));
    expect(flags).toEqual({ Hello: [false, false], Countdown: [false, true], Collect: [true, false], Chat: [true, true] });
  });

  it('builds an example body from the request message fields', () => {
    const body = JSON.parse(services[0].methods[0].exampleBody);
    expect(body).toEqual({ name: '', tags: [], inner: { n: 0 }, counts: {}, kind: 'KIND_A', loud: false, inners: [] });
  });
});

describe('grpc config helpers', () => {
  it('adds paths once and removes by index', () => {
    expect(addUniquePath(['a'], 'a')).toEqual(['a']);
    expect(addUniquePath(['a'], 'b')).toEqual(['a', 'b']);
    expect(removePathAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('round-trips method keys even with dotted service names', () => {
    expect(parseMethodKey(methodKey('pkg.v1.Svc', 'Call'))).toEqual({ service: 'pkg.v1.Svc', method: 'Call' });
    expect(parseMethodKey('')).toEqual({ service: '', method: '' });
  });

  it('replaces the message only when empty or still the previous example', () => {
    expect(shouldReplaceMessage('  ', undefined)).toBe(true);
    expect(shouldReplaceMessage('{"a":1}', '{"a":1}')).toBe(true);
    expect(shouldReplaceMessage('{"a":2}', '{"a":1}')).toBe(false);
  });

  it('describes call shapes and composer availability', () => {
    expect(describeCallShape({ requestStream: true, responseStream: true })).toBe('Bidirectional streaming');
    expect(describeCallShape({ requestStream: false, responseStream: false })).toBe('Unary');
    expect(allowsComposer({ requestStream: true })).toBe(true);
    expect(allowsComposer(undefined)).toBe(false);
  });
});

describe('grpc call preparation', () => {
  it('substitutes variables and lowercases enabled metadata keys', () => {
    const request = {
      ...createRequest('G', () => 'g', 'grpc'),
      url: 'grpc://{{host}}:50051/',
      body: { type: 'json' as const, text: '{"name":"{{who}}"}', form: [] },
      headers: [
        { key: 'Authorization', value: 'Bearer {{token}}', enabled: true },
        { key: 'x-off', value: '1', enabled: false },
      ],
      timeoutMs: 2500,
    };
    const prepared = prepareGrpcCall(request, { host: 'api.local', who: 'Ada', token: 't' });
    expect(prepared.target).toBe('api.local:50051');
    expect(prepared.message).toBe('{"name":"Ada"}');
    expect(prepared.metadata).toEqual([['authorization', 'Bearer t']]);
    expect(prepared.deadlineMs).toBe(2500);
  });

  it('normalizes targets and names status codes', () => {
    expect(normalizeGrpcTarget(' https://host:443/ ')).toBe('host:443');
    expect(grpcStatusName(14)).toBe('UNAVAILABLE');
    expect(grpcStatusName(99)).toBe('CODE_99');
  });
});
