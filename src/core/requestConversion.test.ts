import { describe, expect, it } from 'vitest';
import { createRequest } from './factories';
import { canUndoConversion, conversionTargetOf, convertRequest, convertToGraphql, convertToHttp, describeConversion } from './requestConversion';
import { RequestBody, RequestModel } from '../shared/types';

function httpRequestWith(body: RequestBody, overrides: Partial<RequestModel> = {}): RequestModel {
  return { ...createRequest('Users', () => 'req-1'), method: 'PUT', url: 'https://api.test/graphql', body, ...overrides };
}

function jsonBody(text: string): RequestBody {
  return { type: 'json', text, form: [] };
}

describe('convertToGraphql', () => {
  it('moves a JSON payload with a variables object into the GraphQL fields', () => {
    const request = httpRequestWith(jsonBody('{"query":"query Q { a }","variables":{"a":1},"operationName":"Q"}'), { method: 'POST' });
    const { request: converted, warnings } = convertToGraphql(request);
    expect(converted).toMatchObject({ id: 'req-1', name: 'Users', url: request.url, kind: 'graphql', method: 'POST' });
    expect(converted.body).toEqual({
      type: 'graphql',
      text: 'query Q { a }',
      form: [],
      graphqlVariables: JSON.stringify({ a: 1 }, null, 2),
      graphqlOperationName: 'Q',
    });
    expect(warnings).toEqual([]);
  });

  it('parses variables given as a JSON string', () => {
    const { request } = convertToGraphql(httpRequestWith(jsonBody('{"query":"{ a }","variables":"{\\"a\\":1}"}')));
    expect(request.body.graphqlVariables).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('forces POST and keeps headers except a plain JSON Content-Type', () => {
    const headers = [
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'X-Trace', value: '1', enabled: true },
    ];
    const { request } = convertToGraphql(httpRequestWith(jsonBody('{"query":"{ a }"}'), { headers }));
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual([headers[1]]);
  });

  it('warns about a JSON body that is not a GraphQL payload', () => {
    const { request, warnings } = convertToGraphql(httpRequestWith(jsonBody('{"name":"x"}')));
    expect(request.body).toEqual({ type: 'graphql', text: '', form: [] });
    expect(warnings).toHaveLength(1);
  });

  it('warns about extra payload fields and unusable variables', () => {
    const { warnings } = convertToGraphql(httpRequestWith(jsonBody('{"query":"{ a }","variables":"nope","extensions":{}}')));
    expect(warnings).toHaveLength(2);
  });

  it('uses a text body as the query only when it looks like GraphQL', () => {
    const query = convertToGraphql(httpRequestWith({ type: 'text', text: 'query Q { a }', form: [] }));
    expect(query.request.body.text).toBe('query Q { a }');
    const other = convertToGraphql(httpRequestWith({ type: 'text', text: 'hello', form: [] }));
    expect(other.request.body.text).toBe('');
    expect(other.warnings).toHaveLength(1);
  });

  it('warns when a form body is discarded', () => {
    const body: RequestBody = { type: 'form', text: '', form: [{ key: 'a', value: '1', enabled: true }] };
    const { request, warnings } = convertToGraphql(httpRequestWith(body));
    expect(request.body).toEqual({ type: 'graphql', text: '', form: [] });
    expect(warnings).toHaveLength(1);
  });

  it('converts an empty body silently', () => {
    expect(convertToGraphql(httpRequestWith({ type: 'none', text: '', form: [] })).warnings).toEqual([]);
  });
});

describe('convertToHttp', () => {
  it('builds a JSON body with variables as a JSON value', () => {
    const graphql: RequestModel = {
      ...createRequest('G', () => 'g', 'graphql'),
      body: { type: 'graphql', text: 'query Q { a }', form: [], graphqlVariables: '{"a":1}', graphqlOperationName: 'Q' },
    };
    const { request, warnings } = convertToHttp(graphql);
    expect(request.kind).toBeUndefined();
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual([{ key: 'Content-Type', value: 'application/json', enabled: true }]);
    expect(JSON.parse(request.body.text)).toEqual({ query: 'query Q { a }', variables: { a: 1 }, operationName: 'Q' });
    expect(warnings).toEqual([]);
  });

  it('warns about invalid variables', () => {
    const graphql: RequestModel = { ...createRequest('G', () => 'g', 'graphql'), body: { type: 'graphql', text: '{ a }', form: [], graphqlVariables: '{oops' } };
    const { request, warnings } = convertToHttp(graphql);
    expect(JSON.parse(request.body.text)).toEqual({ query: '{ a }' });
    expect(warnings).toHaveLength(1);
  });

  it('round-trips through GraphQL', () => {
    const original = httpRequestWith(jsonBody('{"query":"query Q { a }","variables":{"a":1},"operationName":"Q"}'), { method: 'POST' });
    const roundTripped = convertToHttp(convertToGraphql(original).request).request;
    expect(JSON.parse(roundTripped.body.text)).toEqual(JSON.parse(original.body.text));
  });
});

describe('conversionTargetOf', () => {
  it('offers conversion only for non-streaming http and graphql requests', () => {
    expect(conversionTargetOf(createRequest('a'))).toBe('graphql');
    expect(conversionTargetOf(createRequest('a', () => 'x', 'graphql'))).toBe('http');
    expect(conversionTargetOf({ ...createRequest('a'), stream: true })).toBeUndefined();
    for (const kind of ['sse', 'websocket', 'grpc'] as const) {
      expect(conversionTargetOf(createRequest('a', () => 'x', kind))).toBeUndefined();
    }
  });
});

describe('conversion undo support', () => {
  const original = httpRequestWith(jsonBody('{"query":"{ a }"}'), { method: 'POST' });

  it('allows undo only while the converted request is untouched', () => {
    const { request: converted } = convertRequest(original, 'graphql');
    expect(canUndoConversion(converted, { ...converted })).toBe(true);
    expect(canUndoConversion(converted, { ...converted, url: 'https://other.test' })).toBe(false);
  });

  it('keeps the original untouched so restoring it round-trips', () => {
    const snapshot = JSON.stringify(original);
    const { request: toGraphql } = convertRequest(original, 'graphql');
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(convertRequest(toGraphql, 'http').request.kind).toBeUndefined();
  });

  it('describes the conversion with its warnings', () => {
    expect(describeConversion('graphql', [])).toBe('Converted to GraphQL.');
    expect(describeConversion('http', ['Lost A.', 'Lost B.'])).toBe('Converted to HTTP. Lost A. Lost B.');
  });
});
