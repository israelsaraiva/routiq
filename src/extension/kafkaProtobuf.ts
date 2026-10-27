import * as fs from 'fs';
import * as path from 'path';
import * as protobuf from 'protobufjs';
import { RegistryProtoSources, createRegistryDecoder, lookupMessageType, toJsonDecoder } from '../core/kafka/protobuf/protobufDecoder';
import { ProtobufSettings, hasLocalProtobuf, resolveMessageType } from '../core/kafka/protobuf/topicTypes';
import { RegisteredSchema, SchemaReference, SchemaRegistryConfig } from './schemaRegistry';

const MAX_REFERENCE_DEPTH = 8;
const NO_MESSAGE_TYPE = 'No protobuf message type chosen for this topic (set "Protobuf message type" in the connection)';

export type ReferenceLoader = (config: SchemaRegistryConfig, reference: SchemaReference) => Promise<RegisteredSchema>;

export async function loadProtoRootFromFile(file: string): Promise<protobuf.Root> {
  const root = new protobuf.Root();
  const defaultResolve = root.resolvePath.bind(root);
  root.resolvePath = (origin, target) => {
    const sibling = defaultResolve(origin, target);
    return sibling && fs.existsSync(sibling) ? sibling : path.join(path.dirname(file), target);
  };
  return root.load(file);
}

export class LocalProtobufSource {
  private settings: ProtobufSettings | undefined;
  private root: Promise<protobuf.Root> | undefined;

  constructor(private readonly loadRoot: (file: string) => Promise<protobuf.Root> = loadProtoRootFromFile) {}

  configure(settings: ProtobufSettings | undefined): void {
    const changed = JSON.stringify(settings) !== JSON.stringify(this.settings);
    this.settings = settings;
    changed && (this.root = undefined);
  }

  isConfigured(): boolean {
    return hasLocalProtobuf(this.settings);
  }

  async decode(bytes: Uint8Array, topic: string): Promise<string> {
    const typeName = resolveMessageType(this.settings, topic);
    if (!typeName) {
      throw new Error(NO_MESSAGE_TYPE);
    }
    const root = await this.loadedRoot();
    return toJsonDecoder(lookupMessageType(root, typeName))(bytes);
  }

  private loadedRoot(): Promise<protobuf.Root> {
    const loading = this.root ?? this.loadRoot((this.settings as { file: string }).file.trim());
    this.root = loading;
    loading.catch(() => (this.root = undefined));
    return loading;
  }
}

async function collectReferences(
  config: SchemaRegistryConfig,
  references: SchemaReference[] | undefined,
  loadReference: ReferenceLoader,
  collected: Record<string, string>,
  depth: number,
): Promise<void> {
  if (depth > MAX_REFERENCE_DEPTH) {
    return;
  }
  for (const reference of references ?? []) {
    if (reference.name in collected) {
      continue;
    }
    const loaded = await loadReference(config, reference);
    collected[reference.name] = loaded.schema;
    await collectReferences(config, loaded.references, loadReference, collected, depth + 1);
  }
}

export async function compileRegistryProtobuf(
  config: SchemaRegistryConfig,
  { schema, references }: RegisteredSchema,
  loadReference: ReferenceLoader,
): Promise<(bytes: Uint8Array, offset: number) => string> {
  const collected: Record<string, string> = {};
  await collectReferences(config, references, loadReference, collected, 0);
  const sources: RegistryProtoSources = { main: schema, references: collected };
  return createRegistryDecoder(sources);
}
