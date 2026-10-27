import * as path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PreparedGrpcCall } from '../core/grpcPreparation';
import { runGrpcCall } from './grpcRunner';

const PROTO_PATH = path.join(__dirname, '..', 'core', 'testdata', 'greeter.proto');
const TLS = { rejectUnauthorized: true };

function callFor(method: string, target: string): PreparedGrpcCall {
  return { target, tls: false, useReflection: false, protoFiles: [PROTO_PATH], importPaths: [], service: 'demo.Greeter', method, metadata: [], message: '{"name":"Ada"}' };
}

describe('runGrpcCall', () => {
  let server: grpc.Server;
  let target: string;

  beforeAll(async () => {
    const definitions = await protoLoader.load(PROTO_PATH, { keepCase: true });
    const service = (grpc.loadPackageDefinition(definitions) as any).demo.Greeter.service;
    server = new grpc.Server();
    server.addService(service, {
      Hello: (call: any, callback: any) => callback(null, { message: `Hello ${call.request.name}` }),
      Countdown: (call: any) => {
        [3, 2, 1].forEach((n) => call.write({ message: `${call.request.name}${n}` }));
        call.end();
      },
      Collect: (call: any, callback: any) => {
        call.on('data', () => undefined);
        call.on('end', () => callback(null, { message: 'collected' }));
      },
    });
    const port = await new Promise<number>((resolve, reject) =>
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, bound) => (error ? reject(error) : resolve(bound))),
    );
    target = `127.0.0.1:${port}`;
  });

  afterAll(() => server.forceShutdown());

  it('records the reply of a unary call', async () => {
    const outcome = await runGrpcCall(callFor('Hello', target), TLS, { maxMessages: 5, timeoutMs: 5000 });
    expect(outcome).toMatchObject({ statusCode: 0, statusName: 'OK', messagesCapped: false });
    expect(outcome.messages.map((text) => JSON.parse(text).message)).toEqual(['Hello Ada']);
  });

  it('stops a server stream at the message cap', async () => {
    const outcome = await runGrpcCall(callFor('Countdown', target), TLS, { maxMessages: 2, timeoutMs: 5000 });
    expect(outcome.messages).toHaveLength(2);
    expect(outcome.messagesCapped).toBe(true);
  });

  it('sends the single message and ends a client stream', async () => {
    const outcome = await runGrpcCall(callFor('Collect', target), TLS, { maxMessages: 5, timeoutMs: 5000 });
    expect(JSON.parse(outcome.messages[0]).message).toBe('collected');
  });

  it('reports an unreachable server as UNAVAILABLE', async () => {
    const outcome = await runGrpcCall(callFor('Hello', '127.0.0.1:1'), TLS, { maxMessages: 5, timeoutMs: 5000 });
    expect(outcome.statusName).toBe('UNAVAILABLE');
  });

  it('reports a missing proto as a failure', async () => {
    const outcome = await runGrpcCall({ ...callFor('Hello', target), protoFiles: [] }, TLS, { maxMessages: 5, timeoutMs: 5000 });
    expect(outcome.error).toContain('.proto');
  });
});
