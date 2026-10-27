import { describe, expect, it } from 'vitest';
import { KafkaMessage } from '../../shared/types';
import { buildRequestFromItem, buildSaveItems } from './messageToRequest';

const message = (value: string, headers?: Record<string, string>): KafkaMessage => ({
  id: 'm', flowId: 'flow-9', timestamp: 1, topic: 'orders', partition: 0, offset: '0', key: null, value, headers,
});

describe('message to request', () => {
  it('creates a POST request with json body and headers', () => {
    const [item] = buildSaveItems([message('{"a":1}', { traceId: 'x' })]);
    const request = buildRequestFromItem(item);
    expect(request.name).toBe('orders/flow-9');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual([{ key: 'traceId', value: 'x', enabled: true }]);
    expect(request.body.type).toBe('json');
    expect(JSON.parse(request.body.text)).toEqual({ a: 1 });
  });

  it('uses a text body for non-json values and numbers flow messages', () => {
    const items = buildSaveItems([message('plain'), message('{}')]);
    expect(items.map((item) => item.name)).toEqual(['orders/flow-9 #1', 'orders/flow-9 #2']);
    expect(buildRequestFromItem(items[0]).body).toMatchObject({ type: 'text', text: 'plain' });
  });
});
