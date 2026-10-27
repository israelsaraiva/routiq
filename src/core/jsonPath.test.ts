import { describe, expect, it } from 'vitest';
import { evaluateJsonPath } from './jsonPath';

const document = { data: [{ name: 'a', 'odd key': 1 }, { name: 'b' }], count: 2 };

describe('evaluateJsonPath', () => {
  it('resolves dot and index segments', () => {
    expect(evaluateJsonPath('$.data[0].name', document)).toEqual({ ok: true, value: 'a' });
    expect(evaluateJsonPath('data[1].name', document)).toEqual({ ok: true, value: 'b' });
  });

  it('supports negative indexes and quoted keys', () => {
    expect(evaluateJsonPath('$.data[-1].name', document)).toEqual({ ok: true, value: 'b' });
    expect(evaluateJsonPath("$.data[0]['odd key']", document)).toEqual({ ok: true, value: 1 });
  });

  it('collects wildcard matches', () => {
    expect(evaluateJsonPath('$.data[*].name', document)).toEqual({ ok: true, value: ['a', 'b'] });
  });

  it('returns the whole document for $', () => {
    expect(evaluateJsonPath('$', document)).toEqual({ ok: true, value: document });
  });

  it('reports missing and invalid paths', () => {
    expect(evaluateJsonPath('$.nope', document)).toEqual({ ok: false, error: 'No match' });
    expect(evaluateJsonPath('$.data[', document)).toEqual({ ok: false, error: 'Invalid path' });
  });
});
