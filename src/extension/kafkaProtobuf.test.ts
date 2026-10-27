import * as path from 'node:path';
import * as protobuf from 'protobufjs';
import { describe, expect, it } from 'vitest';
import { toBase64 } from '../core/kafka/wireFormat';
import { KafkaMessage } from '../shared/types';
import { KafkaValueDecoder } from './kafkaDecoding';
import { LocalProtobufSource, loadProtoRootFromFile } from './kafkaProtobuf';

const SHIPMENT_FILE = path.join(__dirname, 'fixtures', 'shipment.proto');
const SHIPMENT = { id: 's-1', destination: { city: 'Liège' }, weights: [3, 200, 70000] };

async function encodeShipment(typeName = 'logistics.Shipment', value: object = SHIPMENT): Promise<Uint8Array> {
  const type = (await loadProtoRootFromFile(SHIPMENT_FILE)).lookupType(typeName);
  return type.encode(type.fromObject(value)).finish();
}

function messageWith(bytes: Uint8Array, topic = 'shipments'): KafkaMessage {
  return { id: 'm', flowId: 'unknown', timestamp: 1, topic, partition: 0, offset: '0', key: null, value: 'garbled', valueBase64: toBase64(bytes) };
}

describe('loadProtoRootFromFile', () => {
  it('resolves imports relative to the .proto file', async () => {
    const root = await loadProtoRootFromFile(SHIPMENT_FILE);
    expect(root.lookupType('logistics.Address')).toBeTruthy();
  });
});

describe('LocalProtobufSource', () => {
  it('decodes with the topic specific type and falls back to the default type', async () => {
    const source = new LocalProtobufSource();
    source.configure({ file: SHIPMENT_FILE, messageType: 'logistics.Shipment', topicTypes: 'addresses=logistics.Address' });
    const address = await encodeShipment('logistics.Address', { city: 'Ghent' });
    expect(JSON.parse(await source.decode(address, 'addresses'))).toEqual({ city: 'Ghent' });
    expect(JSON.parse(await source.decode(await encodeShipment(), 'shipments'))).toEqual(SHIPMENT);
  });

  it('asks for a message type when none applies and reports unknown types', async () => {
    const source = new LocalProtobufSource(async () => new protobuf.Root());
    source.configure({ file: 'x.proto' });
    await expect(source.decode(new Uint8Array(), 't')).rejects.toThrow(/No protobuf message type/);
    source.configure({ file: 'x.proto', messageType: 'nope.Missing' });
    await expect(source.decode(new Uint8Array(), 't')).rejects.toThrow(/not found/);
  });

  it('reloads the file after the settings change', async () => {
    let loads = 0;
    const source = new LocalProtobufSource(async (file) => (loads++, loadProtoRootFromFile(file)));
    source.configure({ file: SHIPMENT_FILE, messageType: 'logistics.Shipment' });
    await source.decode(await encodeShipment(), 't');
    await source.decode(await encodeShipment(), 't');
    source.configure({ file: SHIPMENT_FILE, messageType: 'logistics.Address' });
    await source.decode(await encodeShipment('logistics.Address', {}), 't');
    expect(loads).toBe(2);
  });
});

describe('KafkaValueDecoder with a local .proto file', () => {
  const configured = () => {
    const decoder = new KafkaValueDecoder();
    decoder.configureProtobuf({ file: SHIPMENT_FILE, messageType: 'logistics.Shipment' });
    return decoder;
  };

  it('decodes binary plain protobuf payloads automatically', async () => {
    const withInvalidUtf8 = await encodeShipment('logistics.Shipment', { id: 's-2', weights: [255, 300] });
    const decoded = await configured().decodeBytes(withInvalidUtf8, 'shipments');
    expect(decoded.format).toBe('protobuf');
    expect(JSON.parse(decoded.text)).toMatchObject({ id: 's-2', weights: [255, 300] });
  });

  it('decodes a payload that happens to be valid UTF-8 when protobuf is chosen explicitly', async () => {
    const bytes = await encodeShipment('logistics.Address', { city: 'Ghent' });
    const address = new KafkaValueDecoder();
    address.configureProtobuf({ file: SHIPMENT_FILE, messageType: 'logistics.Address' });
    expect(await address.decodeProtobuf(bytes, 'shipments')).toEqual({ format: 'protobuf', text: '{"city":"Ghent"}' });
  });

  it('falls back to hex with a clear message when nothing is configured or decoding fails', async () => {
    const unconfigured = await new KafkaValueDecoder().decodeProtobuf(Uint8Array.from([8, 1]), 't');
    expect(unconfigured).toMatchObject({ format: 'binary', text: '08 01' });
    expect(unconfigured.error).toMatch(/No \.proto file/);
    const corrupt = await configured().decodeProtobuf(Uint8Array.from([0x0a, 0xff]), 't');
    expect(corrupt).toMatchObject({ format: 'binary', text: '0a ff' });
    expect(corrupt.error).toMatch(/Could not decode as protobuf/);
  });
});
