import * as path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PreparedGrpcCall } from '../core/grpcPreparation';
import { GrpcCallStatus } from '../shared/types';
import { connectGrpc, describeProtoServices } from './grpcClient';

const PROTO_PATH = path.join(__dirname, '..', 'core', 'testdata', 'greeter.proto');

interface Recording {
  received: string[];
  sent: string[];
  status?: GrpcCallStatus;
  closed: Promise<{ detail?: string; failed: boolean }>;
  handlers: Parameters<typeof connectGrpc>[2];
}

function record(): Recording {
  const received: string[] = [];
  const sent: string[] = [];
  let resolveClosed!: (value: { detail?: string; failed: boolean }) => void;
  const closed = new Promise<{ detail?: string; failed: boolean }>((resolve) => (resolveClosed = resolve));
  const recording: Recording = { received, sent, closed, handlers: undefined as never };
  recording.handlers = {
    onOpen: () => undefined,
    onSseEvent: () => undefined,
    onWebSocketMessage: (text) => received.push(text),
    onGrpcSent: (text) => sent.push(text),
    onGrpcStatus: (status) => (recording.status = status),
    onClosed: (detail, failed) => resolveClosed({ detail, failed }),
  };
  return recording;
}

function callFor(method: string, message = '{"name":"Ada"}'): PreparedGrpcCall {
  return { target: '', tls: false, protoFiles: [PROTO_PATH], importPaths: [], service: 'demo.Greeter', method, metadata: [], message };
}

describe('grpc client against an in-process server', () => {
  let server: grpc.Server;
  let target: string;
  const seenMetadata: string[] = [];

  beforeAll(async () => {
    const definitions = await protoLoader.load(PROTO_PATH, { keepCase: true });
    const service = (grpc.loadPackageDefinition(definitions) as any).demo.Greeter.service;
    server = new grpc.Server();
    server.addService(service, {
      Hello: (call: any, callback: any) => {
        seenMetadata.push(String(call.metadata.get('x-token')[0]));
        callback(null, { message: `Hello ${call.request.name}` });
      },
      Countdown: (call: any) => {
        [2, 1].forEach((n) => call.write({ message: `${call.request.name}${n}` }));
        call.end();
      },
      Collect: (call: any, callback: any) => {
        const names: string[] = [];
        call.on('data', (request: any) => names.push(request.name));
        call.on('end', () => callback(null, { message: names.join(',') }));
      },
      Chat: (call: any) => {
        call.on('data', (request: any) => call.write({ message: `echo ${request.name}` }));
        call.on('end', () => call.end());
      },
    });
    const port = await new Promise<number>((resolve, reject) =>
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, bound) => (error ? reject(error) : resolve(bound))),
    );
    target = `127.0.0.1:${port}`;
  });

  afterAll(() => server.forceShutdown());

  it('describes services from proto files', async () => {
    const services = await describeProtoServices({ protoFiles: [PROTO_PATH], importPaths: [] });
    expect(services[0].methods.map((method) => method.name)).toContain('Countdown');
  });

  it('performs a unary call with metadata and reports OK status', async () => {
    const recording = record();
    await connectGrpc({ ...callFor('Hello'), target, metadata: [['x-token', 'abc']] }, { rejectUnauthorized: true }, recording.handlers);
    const closed = await recording.closed;
    expect(recording.sent).toEqual(['{"name":"Ada"}']);
    expect(JSON.parse(recording.received[0]).message).toBe('Hello Ada');
    expect(recording.status?.codeName).toBe('OK');
    expect(closed.failed).toBe(false);
    expect(seenMetadata).toEqual(['abc']);
  });

  it('receives every message of a server stream', async () => {
    const recording = record();
    await connectGrpc({ ...callFor('Countdown'), target }, { rejectUnauthorized: true }, recording.handlers);
    await recording.closed;
    expect(recording.received.map((text) => JSON.parse(text).message)).toEqual(['Ada2', 'Ada1']);
  });

  it('streams client messages until ended', async () => {
    const recording = record();
    const connection = await connectGrpc({ ...callFor('Collect'), target }, { rejectUnauthorized: true }, recording.handlers);
    connection.send('{"name":"a"}');
    connection.send('{"name":"b"}');
    connection.end();
    await recording.closed;
    expect(JSON.parse(recording.received[0]).message).toBe('a,b');
  });

  it('supports bidirectional chat', async () => {
    const recording = record();
    const connection = await connectGrpc({ ...callFor('Chat'), target }, { rejectUnauthorized: true }, recording.handlers);
    connection.send('{"name":"x"}');
    connection.end();
    await recording.closed;
    expect(JSON.parse(recording.received[0]).message).toBe('echo x');
  });

  it('reports a failure status when the server is unreachable', async () => {
    const recording = record();
    await connectGrpc({ ...callFor('Hello'), target: '127.0.0.1:1' }, { rejectUnauthorized: true }, recording.handlers);
    const closed = await recording.closed;
    expect(closed.failed).toBe(true);
    expect(recording.status?.codeName).toBe('UNAVAILABLE');
  });

  it('cancels an in-flight call', async () => {
    const recording = record();
    const connection = await connectGrpc({ ...callFor('Chat'), target }, { rejectUnauthorized: true }, recording.handlers);
    connection.close();
    await recording.closed;
    expect(recording.status?.codeName).toBe('CANCELLED');
  });
});
