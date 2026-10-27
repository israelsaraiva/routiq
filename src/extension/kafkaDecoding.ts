import * as avro from 'avsc';
import { KafkaDecodedValue } from '../shared/kafkaMessageTypes';
import { KafkaMessage } from '../shared/types';
import { resolveFlowId } from '../core/kafka/flowId';
import { SchemaCache } from '../core/kafka/schemaCache';
import { decodeUtf8Strict, fromBase64, parseConfluentEnvelope, toHex } from '../core/kafka/wireFormat';
import { RegisteredSchema, SchemaRegistryConfig, fetchSchemaById } from './schemaRegistry';

const FAILURE_COOLDOWN_MS = 15_000;
const PROTOBUF_UNSUPPORTED = 'Protobuf decoding not supported yet';
const NO_REGISTRY = 'No Schema Registry configured for this connection';

type PayloadDecoder = (bytes: Uint8Array, offset: number) => KafkaDecodedValue;
type SchemaLoader = (config: SchemaRegistryConfig, schemaId: number) => Promise<RegisteredSchema>;

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
  return (bytes, offset) => ({ format: 'protobuf', text: toHex(bytes.subarray(offset)), error: PROTOBUF_UNSUPPORTED });
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

  constructor(
    private readonly loadSchema: SchemaLoader = fetchSchemaById,
    private readonly now: () => number = Date.now,
  ) {}

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
    const decoded = await this.decodeBytes(fromBase64(message.valueBase64));
    const { flowId, source } = resolveFlowId({ headers: message.headers, value: decoded.text, key: message.key });
    return { ...message, value: decoded.text, valueFormat: decoded.format, schemaId: decoded.schemaId, decodeError: decoded.error, flowId, flowIdSource: source };
  }

  async decodeBytes(bytes: Uint8Array): Promise<KafkaDecodedValue> {
    const envelope = parseConfluentEnvelope(bytes);
    if (envelope) {
      return this.decodeEnveloped(bytes, envelope.schemaId, envelope.payloadOffset);
    }
    const text = decodeUtf8Strict(bytes);
    return text === undefined ? binaryFallback(bytes, 'Not valid UTF-8 text') : { format: 'text', text };
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
      return compileSchema(await this.loadSchema(this.config as SchemaRegistryConfig, schemaId));
    } catch (error) {
      this.unavailableUntil = this.now() + FAILURE_COOLDOWN_MS;
      throw error;
    }
  }
}
