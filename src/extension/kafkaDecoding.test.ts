import * as avro from 'avsc';
import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KafkaMessage } from '../shared/types';
import { toBase64 } from '../core/kafka/wireFormat';
import { KafkaValueDecoder } from './kafkaDecoding';

const AVRO_SCHEMA = { type: 'record', name: 'Order', fields: [{ name: 'id', type: 'string' }, { name: 'total', type: 'int' }] };

function wireFormat(schemaId: number, payload: Uint8Array): Uint8Array {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(schemaId, 1);
  return Buffer.concat([header, payload]);
}

function binaryMessage(bytes: Uint8Array): KafkaMessage {
  return { id: 'm', flowId: 'unknown', timestamp: 1, topic: 't', partition: 0, offset: '0', key: null, value: 'garbled', valueBase64: toBase64(bytes) };
}

describe('KafkaValueDecoder with a stub Schema Registry', () => {
  let server: Server;
  let url: string;
  let requests: IncomingMessage[];
  let responses: Record<string, { schema: string; schemaType?: string } | undefined>;

  beforeEach(async () => {
    requests = [];
    responses = {
      '1': { schema: JSON.stringify(AVRO_SCHEMA) },
      '2': { schema: '{"type":"object"}', schemaType: 'JSON' },
      '3': { schema: 'syntax = "proto3";', schemaType: 'PROTOBUF' },
    };
    server = createServer((request, response) => {
      requests.push(request);
      const entry = responses[request.url?.split('/').pop() ?? ''];
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

  it('explains that protobuf is not supported yet and keeps a hex preview', async () => {
    const decoder = new KafkaValueDecoder();
    decoder.configure({ url });
    const message = await decoder.decodeMessage(binaryMessage(wireFormat(3, Buffer.from([1, 2]))));
    expect(message).toMatchObject({ valueFormat: 'protobuf', decodeError: 'Protobuf decoding not supported yet', value: '01 02' });
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
