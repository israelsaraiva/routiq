import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as protobuf from 'protobufjs';

const REFLECTION_PROTO = `
syntax = "proto3";
message ServerReflectionRequest {
  string host = 1;
  oneof message_request {
    string file_by_filename = 3;
    string file_containing_symbol = 4;
    string list_services = 7;
  }
}
message ServiceResponse { string name = 1; }
message ListServiceResponse { repeated ServiceResponse service = 1; }
message FileDescriptorResponse { repeated bytes file_descriptor_proto = 1; }
message ErrorResponse { int32 error_code = 1; string error_message = 2; }
message ServerReflectionResponse {
  string valid_host = 1;
  oneof message_response {
    FileDescriptorResponse file_descriptor_response = 4;
    ListServiceResponse list_services_response = 6;
    ErrorResponse error_response = 7;
  }
}
`;

const REFLECTION_PATHS = ['/grpc.reflection.v1.ServerReflection/ServerReflectionInfo', '/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo'];
const REFLECTION_SERVICE_PREFIX = 'grpc.reflection.';
const LOADER_OPTIONS: protoLoader.Options = { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true };
const FILE_DESCRIPTOR_SET_FILE_FIELD_TAG = 0x0a;

interface ReflectionRequest {
  file_by_filename?: string;
  file_containing_symbol?: string;
  list_services?: string;
}

interface ReflectionResponse {
  file_descriptor_response?: { file_descriptor_proto: Buffer[] };
  list_services_response?: { service: Array<{ name: string }> };
  error_response?: { error_code: number; error_message: string };
}

export interface ReflectionTarget {
  target: string;
  credentials: grpc.ChannelCredentials;
  metadata: grpc.Metadata;
  deadlineMs?: number;
}

export class ReflectionUnavailableError extends Error {
  constructor(detail: string) {
    super(`Server reflection is not available on this server (${detail}). Enable reflection on the server or select a .proto file.`);
  }
}

const reflectionTypes = protobuf.parse(REFLECTION_PROTO, { keepCase: true }).root;
const RequestType = reflectionTypes.lookupType('ServerReflectionRequest');
const ResponseType = reflectionTypes.lookupType('ServerReflectionResponse');

function encodeRequest(request: ReflectionRequest): Buffer {
  return Buffer.from(RequestType.encode(RequestType.create(request)).finish());
}

function decodeResponse(bytes: Buffer): ReflectionResponse {
  return ResponseType.toObject(ResponseType.decode(bytes), { defaults: false, oneofs: true }) as ReflectionResponse;
}

function exchange(client: grpc.Client, path: string, target: ReflectionTarget, requests: ReflectionSession): Promise<void> {
  const options: grpc.CallOptions = target.deadlineMs ? { deadline: Date.now() + target.deadlineMs } : {};
  const call = client.makeBidiStreamRequest(path, encodeRequest, decodeResponse, target.metadata, options);
  return new Promise<void>((resolve, reject) => {
    requests.attach(call);
    call.on('data', (response: ReflectionResponse) => requests.receive(response));
    call.on('error', reject);
    call.on('end', resolve);
  });
}

class ReflectionSession {
  readonly files = new Map<string, Buffer>();
  readonly services: string[] = [];
  private readonly fileOrder: string[] = [];
  private inFlight = 0;
  private call?: grpc.ClientDuplexStream<ReflectionRequest, ReflectionResponse>;
  private awaitedFilenames: string[] = [];

  attach(call: grpc.ClientDuplexStream<ReflectionRequest, ReflectionResponse>): void {
    this.call = call;
    this.enqueue({ list_services: '*' });
  }

  receive(response: ReflectionResponse): void {
    this.inFlight -= 1;
    if (response.error_response) {
      this.failedLookup(response.error_response.error_message);
    } else if (response.list_services_response) {
      this.receiveServices(response.list_services_response.service.map((service) => service.name));
    } else if (response.file_descriptor_response) {
      response.file_descriptor_response.file_descriptor_proto.forEach((bytes) => this.receiveFile(bytes));
    }
    this.finishWhenIdle();
  }

  fileDescriptorSet(): Buffer {
    return Buffer.concat(this.fileOrder.map((name) => this.files.get(name) as Buffer).map(asFileEntry));
  }

  private failedLookup(message: string): void {
    this.call?.destroy(new Error(`Reflection lookup failed: ${message}`));
  }

  private receiveServices(names: string[]): void {
    names.filter((name) => !name.startsWith(REFLECTION_SERVICE_PREFIX)).forEach((name) => {
      this.services.push(name);
      this.enqueue({ file_containing_symbol: name });
    });
  }

  private receiveFile(bytes: Buffer): void {
    const descriptor = protobuf.Reader.create(bytes);
    const { name, dependencies } = readFileHeader(descriptor);
    if (this.files.has(name)) {
      return;
    }
    this.files.set(name, bytes);
    this.fileOrder.push(name);
    dependencies.filter((dependency) => !this.files.has(dependency) && !this.awaitedFilenames.includes(dependency)).forEach((dependency) => {
      this.awaitedFilenames.push(dependency);
      this.enqueue({ file_by_filename: dependency });
    });
  }

  private enqueue(request: ReflectionRequest): void {
    this.inFlight += 1;
    this.call?.write(request);
  }

  private finishWhenIdle(): void {
    if (this.inFlight <= 0) {
      this.call?.end();
    }
  }
}

function asFileEntry(bytes: Buffer): Buffer {
  const length = protobuf.Writer.create().uint32(bytes.length).finish();
  return Buffer.concat([Buffer.from([FILE_DESCRIPTOR_SET_FILE_FIELD_TAG]), length, bytes]);
}

function readFileHeader(reader: protobuf.Reader): { name: string; dependencies: string[] } {
  const header = { name: '', dependencies: [] as string[] };
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const field = tag >>> 3;
    if (field === 1 && (tag & 7) === 2) {
      header.name = reader.string();
    } else if (field === 3 && (tag & 7) === 2) {
      header.dependencies.push(reader.string());
    } else {
      reader.skipType(tag & 7);
    }
  }
  return header;
}

function isUnimplemented(error: unknown): boolean {
  return (error as { code?: number }).code === grpc.status.UNIMPLEMENTED;
}

function describeReflectionFailure(error: unknown): Error {
  const { code, details, message } = error as { code?: number; details?: string; message?: string };
  if (code === grpc.status.UNIMPLEMENTED) {
    return new ReflectionUnavailableError('UNIMPLEMENTED');
  }
  if (code === grpc.status.UNAVAILABLE) {
    return new Error(`Could not reach the server for reflection: ${details ?? message ?? 'UNAVAILABLE'}`);
  }
  return new Error(`Server reflection failed: ${details ?? message ?? String(error)}`);
}

async function readThroughPath(client: grpc.Client, path: string, target: ReflectionTarget): Promise<ReflectionSession> {
  const session = new ReflectionSession();
  await exchange(client, path, target, session);
  return session;
}

async function readFirstSupportedVersion(client: grpc.Client, target: ReflectionTarget): Promise<ReflectionSession> {
  let lastError: unknown;
  for (const path of REFLECTION_PATHS) {
    try {
      return await readThroughPath(client, path, target);
    } catch (error) {
      lastError = error;
      if (!isUnimplemented(error)) {
        throw error;
      }
    }
  }
  throw lastError;
}

export async function loadReflectionDefinitions(target: ReflectionTarget): Promise<protoLoader.PackageDefinition> {
  const client = new grpc.Client(target.target, target.credentials);
  try {
    const session = await readFirstSupportedVersion(client, target);
    if (session.services.length === 0) {
      throw new ReflectionUnavailableError('no services exposed');
    }
    return protoLoader.loadFileDescriptorSetFromBuffer(session.fileDescriptorSet(), LOADER_OPTIONS);
  } catch (error) {
    throw error instanceof ReflectionUnavailableError ? error : describeReflectionFailure(error);
  } finally {
    client.close();
  }
}
