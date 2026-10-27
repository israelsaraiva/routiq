import * as avro from 'avsc';
import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encodeMessageIndex } from '../core/kafka/protobuf/messageIndex';
import { buildRegistryRoot } from '../core/kafka/protobuf/protobufDecoder';
import { KafkaMessage } from '../shared/types';
import { toBase64 } from '../core/kafka/wireFormat';
import { KafkaValueDecoder } from './kafkaDecoding';

const AVRO_SCHEMA = { type: 'record', name: 'Order', fields: [{ name: 'id', type: 'string' }, { name: 'total', type: 'int' }] };

function wireFormat(schemaId: number, payload: Uint8Array): Uint8Array {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(schemaId, 1);
  return Buffer.concat([header, payload]);
}

const MONEY_PROTO = 'syntax = "proto3"; package common; message Money { string currency = 1; int32 amount = 2; }';
const ORDER_PROTO = `syntax = "proto3";
package shop;
import "common/money.proto";
import "google/protobuf/timestamp.proto";
message Customer { string name = 1; }
message Order { string id = 1; common.Money total = 2; google.protobuf.Timestamp created = 3; repeated string tags = 4; int64 big = 5; }`;
const ORDER_VALUE = { id: 'o-9', total: { currency: 'EUR', amount: 12 }, created: { seconds: 1700000000 }, tags: ['a', 'b'], big: '9007199254740993' };

function encodeOrder(typeName: string, value: object): Uint8Array {
  const type = buildRegistryRoot({ main: ORDER_PROTO, references: { 'common/money.proto': MONEY_PROTO } }).lookupType(typeName);
  return type.encode(type.fromObject(value)).finish();
}

function protobufEnvelope(schemaId: number, path: number[], payload: Uint8Array): Uint8Array {
  return wireFormat(schemaId, Buffer.concat([encodeMessageIndex(path), payload]));
}

function binaryMessage(bytes: Uint8Array): KafkaMessage {
  return { id: 'm', flowId: 'unknown', timestamp: 1, topic: 't', partition: 0, offset: '0', key: null, value: 'garbled', valueBase64: toBase64(bytes) };
}

describe('KafkaValueDecoder with a stub Schema Registry', () => {
  let server: Server;
  let url: string;
  let requests: IncomingMessage[];
  let responses: Record<string, { schema: string; schemaType?: string; references?: unknown[] } | undefined>;

  beforeEach(async () => {
    requests = [];
    responses = {
      '/schemas/ids/1': { schema: JSON.stringify(AVRO_SCHEMA) },
      '/schemas/ids/2': { schema: '{"type":"object"}', schemaType: 'JSON' },
      '/schemas/ids/3': { schema: ORDER_PROTO, schemaType: 'PROTOBUF', references: [{ name: 'common/money.proto', subject: 'money', version: 1 }] },
      '/schemas/ids/4': { schema: 'syntax = "proto3"; message Broken {', schemaType: 'PROTOBUF' },
      '/subjects/money/versions/1': { schema: MONEY_PROTO, schemaType: 'PROTOBUF' },
    };
    server = createServer((request, response) => {
      requests.push(request);
      const entry = responses[request.url ?? ''];
      response.statusCode = entry ? 200 : 404;
      response.end(JSON.stringify(entry ?? {}));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('decodes avro payloads, caches the schema and sends basic auth', async () => {
    const decoder = new KafkaValueDecoder();
    decoder.configure({ url, username: 'user', password: 'secret' });
    const payload = avro.Type.forSchema(AVRO_SCHEMA as avro.Schema).toBuffer({ id: 'o-1', total: 5 });
    const first = await decoder.decodeMessage(binaryMessage(wireFormat(1, payload)));
    const second = await decoder.decodeMessage(binaryMessage(wireFormat(1, payload)));
    expect(JSON.parse(first.value)).toEqual({ id: 'o-1', total: 5 });
    expect(first).toMatchObject({ valueFormat: 'avro', schemaId: 1, decodeError: undefined });
    expect(second.value).toBe(first.value);
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.authorization).toBe(`Basic ${Buffer.from('user:secret').toString('base64')}`);
  });

  it('decodes json schema payloads as json and re-resolves the flow id', async () => {
    const decoder = new KafkaValueDecoder();
    decoder.configure({ url });
    const message = await decoder.decodeMessage(binaryMessage(wireFormat(2, Buffer.from('{"flowId":"abc-1"}'))));
    expect(message).toMatchObject({ valueFormat: 'json-schema', value: '{"flowId":"abc-1"}', flowId: 'abc-1' });
  });

  it('decodes registry protobuf messages using the message index and schema references', async () => {
    const decoder = new KafkaValueDecoder();
    decoder.configure({ url });
    const payload = encodeOrder('shop.Order', ORDER_VALUE);
    const message = await decoder.decodeMessage(binaryMessage(protobufEnvelope(3, [1], payload)));
    expect(message).toMatchObject({ valueFormat: 'protobuf', schemaId: 3, decodeError: undefined });
    expect(JSON.parse(message.value)).toEqual({ id: 'o-9', total: { currency: 'EUR', amount: 12 }, created: { seconds: '1700000000' }, tags: ['a', 'b'], big: '9007199254740993' });
  });

  it('selects the first message type for the single-byte default message index', async () => {
    const decoder = new KafkaValueDecoder();
    decoder.configure({ url });
    const payload = encodeOrder('shop.Customer', { name: 'Ann' });
    const decoded = await decoder.decodeBytes(wireFormat(3, Buffer.concat([Buffer.from([0]), payload])));
    expect(JSON.parse(decoded.text)).toEqual({ name: 'Ann' });
  });

  it('falls back to hex with a friendly error when the registry protobuf cannot be decoded', async () => {
    const decoder = new KafkaValueDecoder();
    decoder.configure({ url });
    const broken = await decoder.decodeBytes(protobufEnvelope(4, [0], Buffer.from([1])));
    expect(broken).toMatchObject({ format: 'binary', schemaId: 4 });
    expect(broken.error).toMatch(/Could not decode with schema 4/);
    const outOfRange = await decoder.decodeBytes(protobufEnvelope(3, [7], Buffer.from([1])));
    expect(outOfRange.error).toMatch(/Message index \[7\] not found/);
  });

  it('falls back to a hex preview when the schema is unknown', async () => {
    const decoder = new KafkaValueDecoder();
    decoder.configure({ url });
    const message = await decoder.decodeMessage(binaryMessage(wireFormat(99, Buffer.from([7]))));
    expect(message.valueFormat).toBe('binary');
    expect(message.value).toBe('00 00 00 00 63 07');
    expect(message.decodeError).toMatch(/404/);
  });

  it('stops hammering an unreachable registry for a while', async () => {
    let clock = 0;
    const decoder = new KafkaValueDecoder(undefined, () => clock);
    decoder.configure({ url: 'http://127.0.0.1:1' });
    const bytes = wireFormat(1, Buffer.from([1]));
    await decoder.decodeBytes(bytes);
    const retried = await decoder.decodeBytes(bytes);
    expect(retried.error).toMatch(/unavailable/);
    clock = 60_000;
    expect((await decoder.decodeBytes(bytes)).error).not.toMatch(/unavailable/);
  });

  it('reports a missing registry and leaves plain text untouched', async () => {
    const decoder = new KafkaValueDecoder();
    expect((await decoder.decodeBytes(wireFormat(1, Buffer.from([1])))).error).toMatch(/No Schema Registry/);
    expect(await decoder.decodeBytes(Buffer.from('hello'))).toEqual({ format: 'text', text: 'hello' });
    const plain: KafkaMessage = { ...binaryMessage(Buffer.from('x')), valueBase64: undefined };
    expect(await decoder.decodeMessage(plain)).toBe(plain);
  });
});
