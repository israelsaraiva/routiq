import * as protobuf from 'protobufjs';
import { parseMessageIndex } from './messageIndex';

export type ProtobufJsonDecoder = (bytes: Uint8Array) => string;

export interface RegistryProtoSources {
  main: string;
  references: Record<string, string>;
}

const WELL_KNOWN_PREFIX = 'google/protobuf/';
const IMPORT_PATTERN = /^\s*import\s+(?:public\s+|weak\s+)?["']([^"']+)["']/gm;
const TO_OBJECT_OPTIONS: protobuf.IConversionOptions = { longs: String, enums: String, bytes: String, oneofs: true };

function addWellKnownTypes(root: protobuf.Root, protoText: string, loaded: Set<string>): void {
  for (const [, importPath] of protoText.matchAll(IMPORT_PATTERN)) {
    const descriptor = importPath.startsWith(WELL_KNOWN_PREFIX) && !loaded.has(importPath) ? protobuf.common.get(importPath) : undefined;
    loaded.add(importPath);
    descriptor?.nested && root.addJSON(descriptor.nested);
  }
}

function parseInto(root: protobuf.Root, protoText: string, loaded = new Set<string>()): protobuf.IParserResult {
  addWellKnownTypes(root, protoText, loaded);
  return protobuf.parse(protoText, root);
}

export function buildRegistryRoot({ main, references }: RegistryProtoSources): protobuf.Root {
  const root = new protobuf.Root();
  const loaded = new Set<string>();
  Object.values(references).forEach((text) => parseInto(root, text, loaded));
  parseInto(root, main, loaded);
  return root;
}

function messageTypesOf(namespace: protobuf.NamespaceBase): protobuf.Type[] {
  return namespace.nestedArray.filter((nested): nested is protobuf.Type => nested instanceof protobuf.Type);
}

export function messageTypeNameAtPath(mainProto: string, path: number[]): string {
  const root = new protobuf.Root();
  const { package: packageName } = parseInto(root, mainProto);
  let namespace: protobuf.NamespaceBase = packageName ? (root.lookup(packageName) as protobuf.Namespace) : root;
  let type: protobuf.Type | undefined;
  for (const index of path) {
    type = messageTypesOf(namespace)[index];
    if (!type) {
      throw new Error(`Message index [${path.join(', ')}] not found in schema`);
    }
    namespace = type;
  }
  return (type as protobuf.Type).fullName.replace(/^\./, '');
}

export function toJsonDecoder(type: protobuf.Type): ProtobufJsonDecoder {
  return (bytes) => JSON.stringify(type.toObject(type.decode(bytes), TO_OBJECT_OPTIONS));
}

export function lookupMessageType(root: protobuf.Root, typeName: string): protobuf.Type {
  const resolved = root.lookup(typeName.trim());
  if (!(resolved instanceof protobuf.Type)) {
    throw new Error(`Message type "${typeName}" not found in the .proto definition`);
  }
  return resolved;
}

export function createRegistryDecoder(sources: RegistryProtoSources): (bytes: Uint8Array, offset: number) => string {
  const root = buildRegistryRoot(sources);
  const decoders = new Map<string, ProtobufJsonDecoder>();
  return (bytes, offset) => {
    const { path, payloadOffset } = parseMessageIndex(bytes, offset);
    const typeName = messageTypeNameAtPath(sources.main, path);
    const decoder = decoders.get(typeName) ?? toJsonDecoder(lookupMessageType(root, typeName));
    decoders.set(typeName, decoder);
    return decoder(bytes.subarray(payloadOffset));
  };
}
