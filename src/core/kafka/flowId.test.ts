import { describe, expect, it } from 'vitest';
import { findFlowIdDeep, resolveFlowId } from './flowId';

describe('resolveFlowId', () => {
  it('prefers the header over content and key', () => {
    const result = resolveFlowId({ headers: { 'flow-id': 'from-header' }, value: JSON.stringify({ flowId: 'from-json' }), key: 'from-key' });
    expect(result).toEqual({ flowId: 'from-header', source: 'header' });
  });

  it('reads resource.flowId before root fields', () => {
    const value = JSON.stringify({ flowId: 'root', resource: { flowId: 'resource' } });
    expect(resolveFlowId({ value })).toEqual({ flowId: 'resource', source: 'json-content' });
  });

  it('falls back to the key and then to unknown', () => {
    expect(resolveFlowId({ value: 'plain', key: 'k-1' })).toEqual({ flowId: 'k-1', source: 'key' });
    expect(resolveFlowId({ value: 'plain', key: null })).toEqual({ flowId: 'unknown', source: 'none' });
  });
});

describe('findFlowIdDeep', () => {
  it('finds nested ids and ignores non objects', () => {
    expect(findFlowIdDeep({ a: { b: { flow_id: 'deep' } } })).toBe('deep');
    expect(findFlowIdDeep('text')).toBeNull();
  });
});
