import * as path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { ReflectionService } from '@grpc/reflection';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PreparedGrpcCall } from '../core/grpcPreparation';
import { connectGrpc, describeGrpcServices } from './grpcClient';

const PROTO_PATH = path.join(__dirname, '..', 'core', 'testdata', 'greeter.proto');
const TLS = { rejectUnauthorized: true };

type ServerBinding = { server: grpc.Server; target: string };

async function startServer(register: (server: grpc.Server, definitions: protoLoader.PackageDefinition) => void): Promise<ServerBinding> {
  const definitions = await protoLoader.load(PROTO_PATH, { keepCase: true });
  const server = new grpc.Server();
  const service = (grpc.loadPackageDefinition(definitions) as any).demo.Greeter.service;
  server.addService(service, {
    Hello: (call: any, callback: any) => callback(null, { message: `Hello ${call.request.name}` }),
    Countdown: (call: any) => {
      call.write({ message: 'one' });
      call.end();
    },
    Collect: (_call: any, callback: any) => callback(null, { message: '' }),
    Chat: (call: any) => call.end(),
  });
  register(server, definitions);
  const port = await new Promise<number>((resolve, reject) =>
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, bound) => (error ? reject(error) : resolve(bound))),
  );
  return { server, target: `127.0.0.1:${port}` };
}

function v1AlphaOnly(server: grpc.Server): Pick<grpc.Server, 'addService'> {
  return { addService: (definition, implementation) => !Object.keys(definition).some((key) => definition[key].path.includes('reflection.v1.')) && server.addService(definition, implementation) };
}

function sourceFor(target: string, overrides: Partial<PreparedGrpcCall> = {}): PreparedGrpcCall {
  return { target, tls: false, useReflection: true, protoFiles: [], importPaths: [], service: 'demo.Greeter', method: 'Hello', metadata: [], message: '{"name":"Ada"}', ...overrides };
}

function connectAndCollect(prepared: PreparedGrpcCall): Promise<{ received: string[]; failed: boolean }> {
  const received: string[] = [];
  return new Promise((resolve) => {
    void connectGrpc(prepared, TLS, {
      onOpen: () => undefined,
      onSseEvent: () => undefined,
      onGrpcSent: () => undefined,
      onGrpcStatus: () => undefined,
      onWebSocketMessage: (text) => received.push(text),
      onClosed: (_detail, failed) => resolve({ received, failed }),
    }).then((connection) => {
      connection.send(prepared.message);
      connection.end();
    });
  });
}

describe('grpc server reflection', () => {
  let withReflection: ServerBinding;
  let alphaOnly: ServerBinding;
  let withoutReflection: ServerBinding;

  beforeAll(async () => {
    withReflection = await startServer((server, definitions) => new ReflectionService(definitions).addToServer(server));
    alphaOnly = await startServer((server, definitions) => new ReflectionService(definitions).addToServer(v1AlphaOnly(server)));
    withoutReflection = await startServer(() => undefined);
  });

  afterAll(() => [withReflection, alphaOnly, withoutReflection].forEach(({ server }) => server.forceShutdown()));

  it('lists services, methods and generated example bodies', async () => {
    const services = await describeGrpcServices(sourceFor(withReflection.target), TLS);
    const greeter = services.find((service) => service.name === 'demo.Greeter');
    expect(greeter?.methods.map((method) => method.name)).toEqual(['Hello', 'Countdown', 'Collect', 'Chat']);
    expect(greeter?.methods.find((method) => method.name === 'Countdown')?.responseStream).toBe(true);
    expect(JSON.parse(greeter?.methods[0].exampleBody ?? '{}')).toMatchObject({ name: '', tags: [], inner: { n: 0 }, counts: {}, kind: 'KIND_A', loud: false });
    expect(services.some((service) => service.name.startsWith('grpc.reflection'))).toBe(false);
  });

  it('falls back to the v1alpha reflection service', async () => {
    const services = await describeGrpcServices(sourceFor(alphaOnly.target), TLS);
    expect(services.map((service) => service.name)).toContain('demo.Greeter');
  });

  it('explains when the server has no reflection', async () => {
    await expect(describeGrpcServices(sourceFor(withoutReflection.target), TLS)).rejects.toThrow(/reflection is not available/i);
  });

  it('reports an unreachable server', async () => {
    await expect(describeGrpcServices(sourceFor('127.0.0.1:1', { deadlineMs: 2000 }), TLS)).rejects.toThrow(/reach|reflection/i);
  });

  it('still lists services from proto files when reflection is off', async () => {
    const services = await describeGrpcServices(sourceFor('', { useReflection: false, protoFiles: [PROTO_PATH] }), TLS);
    expect(services[0].name).toBe('demo.Greeter');
  });

  it('performs a unary call using reflected definitions', async () => {
    const { received, failed } = await connectAndCollect(sourceFor(withReflection.target));
    expect(failed).toBe(false);
    expect(JSON.parse(received[0]).message).toBe('Hello Ada');
  });

  it('receives a server stream using reflected definitions', async () => {
    const { received } = await connectAndCollect(sourceFor(withReflection.target, { method: 'Countdown' }));
    expect(JSON.parse(received[0]).message).toBe('one');
  });
});
