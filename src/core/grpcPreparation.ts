import { DEFAULT_GRPC_CONFIG, RequestModel } from '../shared/types';
import { usesReflection } from './grpcConfig';
import { substituteVariables } from './variables';

export interface PreparedGrpcCall {
  target: string;
  tls: boolean;
  useReflection: boolean;
  protoFiles: string[];
  importPaths: string[];
  service: string;
  method: string;
  metadata: Array<[string, string]>;
  message: string;
  deadlineMs?: number;
}

const GRPC_STATUS_NAMES = [
  'OK', 'CANCELLED', 'UNKNOWN', 'INVALID_ARGUMENT', 'DEADLINE_EXCEEDED', 'NOT_FOUND', 'ALREADY_EXISTS', 'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION', 'ABORTED', 'OUT_OF_RANGE', 'UNIMPLEMENTED', 'INTERNAL', 'UNAVAILABLE', 'DATA_LOSS',
  'UNAUTHENTICATED',
];

const BINARY_METADATA_SUFFIX = '-bin';

export function grpcStatusName(code: number): string {
  return GRPC_STATUS_NAMES[code] ?? `CODE_${code}`;
}

export function normalizeGrpcTarget(target: string): string {
  return target.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
}

function nonEmpty(values: string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value !== '');
}

function prepareMetadata(request: RequestModel, values: Record<string, string>): Array<[string, string]> {
  return request.headers
    .filter((header) => header.enabled && header.key.trim() !== '')
    .map((header): [string, string] => [
      substituteVariables(header.key.trim(), values).toLowerCase(),
      substituteVariables(header.value, values),
    ]);
}

export function prepareGrpcCall(request: RequestModel, values: Record<string, string>): PreparedGrpcCall {
  const config = request.grpc ?? DEFAULT_GRPC_CONFIG;
  const substituteAll = (items: string[]) => nonEmpty(items.map((item) => substituteVariables(item, values)));
  return {
    target: normalizeGrpcTarget(substituteVariables(request.url, values)),
    tls: config.tls,
    useReflection: usesReflection(config),
    protoFiles: substituteAll(config.protoFiles),
    importPaths: substituteAll(config.importPaths),
    service: config.service,
    method: config.method,
    metadata: prepareMetadata(request, values),
    message: substituteVariables(request.body.text, values),
    deadlineMs: request.timeoutMs !== undefined && request.timeoutMs > 0 ? Math.floor(request.timeoutMs) : undefined,
  };
}

export function isBinaryMetadataKey(key: string): boolean {
  return key.endsWith(BINARY_METADATA_SUFFIX);
}

export function parseMessageJson(text: string): unknown {
  return text.trim() === '' ? {} : JSON.parse(text);
}

export function describeGrpcStatus(code: number, details: string): string {
  const name = grpcStatusName(code);
  return details ? `${code} ${name}: ${details}` : `${code} ${name}`;
}
