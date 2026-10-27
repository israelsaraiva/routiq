import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { describeServices, ProtoDefinitions, ProtoMethodDefinition } from '../core/grpcDescribe';
import { PreparedGrpcCall, describeGrpcStatus, grpcStatusName, isBinaryMetadataKey, parseMessageJson } from '../core/grpcPreparation';
import { GrpcCallStatus, GrpcServiceDescription } from '../shared/types';
import { loadReflectionDefinitions } from './grpcReflection';
import type { StreamConnection, StreamHandlers } from './streamConnections';

type LoadedDefinitions = protoLoader.PackageDefinition;

type ProtoSource = Pick<PreparedGrpcCall, 'protoFiles' | 'importPaths'>;

const LOADER_OPTIONS: protoLoader.Options = { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true };

export async function loadProtoDefinitions({ protoFiles, importPaths }: ProtoSource): Promise<LoadedDefinitions> {
  if (protoFiles.length === 0) {
    throw new Error('Select at least one .proto file');
  }
  return protoLoader.load(protoFiles, { ...LOADER_OPTIONS, includeDirs: importPaths });
}

export async function describeProtoServices(source: ProtoSource): Promise<GrpcServiceDescription[]> {
  return describeServices((await loadProtoDefinitions(source)) as unknown as ProtoDefinitions);
}

export interface GrpcTlsOptions {
  rejectUnauthorized: boolean;
}

type DefinitionSource = ProtoSource & Pick<PreparedGrpcCall, 'target' | 'tls' | 'useReflection' | 'metadata' | 'deadlineMs'>;

async function loadReflectedDefinitions(source: DefinitionSource, tls: GrpcTlsOptions): Promise<LoadedDefinitions> {
  return loadReflectionDefinitions({
    target: source.target,
    credentials: createCredentials(source.tls, tls),
    metadata: buildMetadata(source.metadata),
    deadlineMs: source.deadlineMs,
  });
}

async function loadDefinitions(source: DefinitionSource, tls: GrpcTlsOptions): Promise<LoadedDefinitions> {
  return source.useReflection ? loadReflectedDefinitions(source, tls) : loadProtoDefinitions(source);
}

export async function describeGrpcServices(source: DefinitionSource, tls: GrpcTlsOptions): Promise<GrpcServiceDescription[]> {
  return describeServices((await loadDefinitions(source, tls)) as unknown as ProtoDefinitions);
}

function createCredentials(tls: boolean, options: GrpcTlsOptions): grpc.ChannelCredentials {
  return tls ? grpc.credentials.createSsl(null, null, null, { rejectUnauthorized: options.rejectUnauthorized }) : grpc.credentials.createInsecure();
}

function buildMetadata(pairs: Array<[string, string]>): grpc.Metadata {
  const metadata = new grpc.Metadata();
  pairs.forEach(([key, value]) => metadata.add(key, isBinaryMetadataKey(key) ? Buffer.from(value, 'base64') : value));
  return metadata;
}

function flattenMetadata(metadata: grpc.Metadata): Array<[string, string]> {
  return Object.entries(metadata.getMap()).map(([key, value]): [string, string] => [key, Buffer.isBuffer(value) ? value.toString('base64') : String(value)]);
}

function toCallStatus(status: grpc.StatusObject): GrpcCallStatus {
  return { code: status.code, codeName: grpcStatusName(status.code), details: status.details, trailers: flattenMetadata(status.metadata) };
}

function toText(message: unknown): string {
  return JSON.stringify(message, null, 2);
}

function findMethodDefinition(definitions: LoadedDefinitions, serviceName: string, methodName: string, source: string): ProtoMethodDefinition & grpc.MethodDefinition<object, object> {
  const service = definitions[serviceName] as unknown as Record<string, grpc.MethodDefinition<object, object> & ProtoMethodDefinition> | undefined;
  const method = service && Object.values(service).find((candidate) => candidate.path === `/${serviceName}/${methodName}`);
  if (!method) {
    throw new Error(`Method ${serviceName}/${methodName} not found in ${source}`);
  }
  return method;
}

type CallStream = grpc.ClientReadableStream<object> | grpc.ClientDuplexStream<object, object> | grpc.ClientWritableStream<object> | grpc.ClientUnaryCall;

interface OpenedCall {
  call: CallStream;
  write?: (message: object) => boolean;
  end?: () => void;
}

function openCall(client: grpc.Client, method: grpc.MethodDefinition<object, object>, prepared: PreparedGrpcCall, handlers: StreamHandlers): OpenedCall {
  const metadata = buildMetadata(prepared.metadata);
  const options: grpc.CallOptions = prepared.deadlineMs ? { deadline: Date.now() + prepared.deadlineMs } : {};
  const onMessage = (message: object) => handlers.onWebSocketMessage(toText(message), false, Buffer.byteLength(toText(message)));
  const { path, requestSerialize, responseDeserialize } = method;
  if (!method.requestStream) {
    const request = parseMessageJson(prepared.message) as object;
    if (!method.responseStream) {
      const call = client.makeUnaryRequest(path, requestSerialize, responseDeserialize, request, metadata, options, (_error, value) => value && onMessage(value));
      return { call };
    }
    const call = client.makeServerStreamRequest(path, requestSerialize, responseDeserialize, request, metadata, options);
    call.on('data', onMessage);
    return { call };
  }
  if (!method.responseStream) {
    const call = client.makeClientStreamRequest(path, requestSerialize, responseDeserialize, metadata, options, (_error, value) => value && onMessage(value));
    return { call, write: (message) => call.write(message), end: () => call.end() };
  }
  const call = client.makeBidiStreamRequest(path, requestSerialize, responseDeserialize, metadata, options);
  call.on('data', onMessage);
  return { call, write: (message) => call.write(message), end: () => call.end() };
}

function openCallOrCloseClient(client: grpc.Client, method: grpc.MethodDefinition<object, object>, prepared: PreparedGrpcCall, handlers: StreamHandlers): OpenedCall {
  try {
    return openCall(client, method, prepared, handlers);
  } catch (error) {
    client.close();
    throw error;
  }
}

export interface GrpcConnection extends StreamConnection {
  end(): void;
}

export async function connectGrpc(prepared: PreparedGrpcCall, tls: GrpcTlsOptions, handlers: StreamHandlers): Promise<GrpcConnection> {
  const definitions = await loadDefinitions(prepared, tls);
  const methodDefinition = findMethodDefinition(definitions, prepared.service, prepared.method, prepared.useReflection ? 'the server reflection response' : 'the selected proto files');
  const client = new grpc.Client(prepared.target, createCredentials(prepared.tls, tls));
  const opened = openCallOrCloseClient(client, methodDefinition, prepared, handlers);
  const finish = (status: grpc.StatusObject) => {
    client.close();
    handlers.onGrpcStatus(toCallStatus(status));
    handlers.onClosed(describeGrpcStatus(status.code, status.details), status.code !== grpc.status.OK);
  };
  opened.call.on('status', finish);
  (opened.call as NodeJS.EventEmitter).on('error', () => undefined);
  handlers.onOpen(`${prepared.service}/${prepared.method}`);
  if (!methodDefinition.requestStream) {
    handlers.onGrpcSent(prepared.message.trim() === '' ? '{}' : prepared.message);
  }
  return {
    close: () => opened.call.cancel(),
    send: (text) => {
      if (!opened.write) {
        return false;
      }
      opened.write(parseMessageJson(text) as object);
      return true;
    },
    end: () => opened.end?.(),
  };
}
