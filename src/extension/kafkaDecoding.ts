import * as avro from 'avsc';
import { KafkaDecodedValue } from '../shared/kafkaMessageTypes';
import { KafkaMessage } from '../shared/types';
import { resolveFlowId } from '../core/kafka/flowId';
import { SchemaCache } from '../core/kafka/schemaCache';
import { ProtobufSettings } from '../core/kafka/protobuf/topicTypes';
import { decodeUtf8Strict, fromBase64, parseConfluentEnvelope, toHex } from '../core/kafka/wireFormat';
import { LocalProtobufSource, ReferenceLoader, compileRegistryProtobuf } from './kafkaProtobuf';
import { RegisteredSchema, SchemaRegistryConfig, fetchSchemaById, fetchSubjectVersion } from './schemaRegistry';

const FAILURE_COOLDOWN_MS = 15_000;
const NO_PROTOBUF_SOURCE = 'No .proto file or Schema Registry configured for this connection';
const NO_REGISTRY = 'No Schema Registry configured for this connection';

type PayloadDecoder = (bytes: Uint8Array, offset: number) => KafkaDecodedValue;
type SchemaLoader = (config: SchemaRegistryConfig, schemaId: number) => Promise<RegisteredSchema>;

export interface ProtobufDependencies {
  loadReference?: ReferenceLoader;
  localSource?: LocalProtobufSource;
}

function stringifyAvro(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
}

function compileSchema({ schema, schemaType }: RegisteredSchema): PayloadDecoder {
  if (schemaType === 'AVRO') {
    const type = avro.Type.forSchema(JSON.parse(schema));
    return (bytes, offset) => ({ format: 'avro', text: stringifyAvro(type.decode(Buffer.from(bytes), offset).value) });
  }
  if (schemaType === 'JSON') {
    return (bytes, offset) => ({ format: 'json-schema', text: new TextDecoder().decode(bytes.subarray(offset)) });
  }
  throw new Error(`Unsupported schema type ${schemaType}`);
}

function binaryFallback(bytes: Uint8Array, error: string, schemaId?: number): KafkaDecodedValue {
  return { format: 'binary', text: toHex(bytes), schemaId, error };
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class KafkaValueDecoder {
  private config: SchemaRegistryConfig | undefined;
  private readonly cache = new SchemaCache<PayloadDecoder>();
  private unavailableUntil = 0;
  private readonly loadReference: ReferenceLoader;
  private readonly localProtobuf: LocalProtobufSource;

  constructor(
    private readonly loadSchema: SchemaLoader = fetchSchemaById,
    private readonly now: () => number = Date.now,
    protobuf: ProtobufDependencies = {},
  ) {
    this.loadReference = protobuf.loadReference ?? fetchSubjectVersion;
    this.localProtobuf = protobuf.localSource ?? new LocalProtobufSource();
  }

  configureProtobuf(settings: ProtobufSettings | undefined): void {
    this.localProtobuf.configure(settings);
  }

  configure(config: SchemaRegistryConfig | undefined): void {
    const changed = JSON.stringify(config) !== JSON.stringify(this.config);
    this.config = config?.url.trim() ? config : undefined;
    changed && this.cache.clear();
    changed && (this.unavailableUntil = 0);
  }

  async decodeMessage(message: KafkaMessage): Promise<KafkaMessage> {
    if (!message.valueBase64) {
      return message;
    }
    const decoded = await this.decodeBytes(fromBase64(message.valueBase64), message.topic);
    const { flowId, source } = resolveFlowId({ headers: message.headers, value: decoded.text, key: message.key });
    return { ...message, value: decoded.text, valueFormat: decoded.format, schemaId: decoded.schemaId, decodeError: decoded.error, flowId, flowIdSource: source };
  }

  async decodeBytes(bytes: Uint8Array, topic = ''): Promise<KafkaDecodedValue> {
    const envelope = parseConfluentEnvelope(bytes);
    if (envelope) {
      return this.decodeEnveloped(bytes, envelope.schemaId, envelope.payloadOffset);
    }
    const text = decodeUtf8Strict(bytes);
    if (text !== undefined) {
      return { format: 'text', text };
    }
    return this.localProtobuf.isConfigured() ? this.decodeLocalProtobuf(bytes, topic) : binaryFallback(bytes, 'Not valid UTF-8 text');
  }

  async decodeProtobuf(bytes: Uint8Array, topic: string): Promise<KafkaDecodedValue> {
    const envelope = parseConfluentEnvelope(bytes);
    if (envelope && this.config) {
      return this.decodeEnveloped(bytes, envelope.schemaId, envelope.payloadOffset);
    }
    if (this.localProtobuf.isConfigured()) {
      return this.decodeLocalProtobuf(bytes, topic);
    }
    return binaryFallback(bytes, envelope ? NO_REGISTRY : NO_PROTOBUF_SOURCE, envelope?.schemaId);
  }

  private async decodeLocalProtobuf(bytes: Uint8Array, topic: string): Promise<KafkaDecodedValue> {
    try {
      return { format: 'protobuf', text: await this.localProtobuf.decode(bytes, topic) };
    } catch (error) {
      return binaryFallback(bytes, `Could not decode as protobuf: ${describeFailure(error)}`);
    }
  }

  private async decodeEnveloped(bytes: Uint8Array, schemaId: number, payloadOffset: number): Promise<KafkaDecodedValue> {
    if (!this.config) {
      return binaryFallback(bytes, NO_REGISTRY, schemaId);
    }
    try {
      const decoder = await this.cache.get(schemaId, (id) => this.compile(id));
      return { ...decoder(bytes, payloadOffset), schemaId };
    } catch (error) {
      return binaryFallback(bytes, `Could not decode with schema ${schemaId}: ${describeFailure(error)}`, schemaId);
    }
  }

  private async compile(schemaId: number): Promise<PayloadDecoder> {
    if (this.now() < this.unavailableUntil) {
      throw new Error('Schema Registry unavailable (retrying shortly)');
    }
    try {
      const config = this.config as SchemaRegistryConfig;
      const registered = await this.loadSchema(config, schemaId);
      return registered.schemaType === 'PROTOBUF' ? this.compileProtobuf(config, registered) : compileSchema(registered);
    } catch (error) {
      this.unavailableUntil = this.now() + FAILURE_COOLDOWN_MS;
      throw error;
    }
  }

  private async compileProtobuf(config: SchemaRegistryConfig, registered: RegisteredSchema): Promise<PayloadDecoder> {
    const decode = await compileRegistryProtobuf(config, registered, this.loadReference);
    return (bytes, offset) => ({ format: 'protobuf', text: decode(bytes, offset) });
  }
}
