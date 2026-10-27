import { describe, expect, it } from 'vitest';
import { buildPostmanEnvironment, buildPostmanExport, POSTMAN_SCHEMA_V21 } from './postmanExport';
import { importPostmanCollection } from './postman';
import { createCollection, createFolder, createRequest } from './factories';

function sampleCollection() {
  const collection = createCollection('Sample', () => 'c1');
  const folder = createFolder('Folder', () => 'f1');
  const request = {
    ...createRequest('Create', () => 'r1'),
    method: 'POST' as const,
    url: 'https://x.test/items',
    params: [{ key: 'a b', value: '1', enabled: true }, { key: 'off', value: '2', enabled: false }],
    headers: [{ key: 'X-A', value: '1', enabled: true }, { key: 'X-B', value: '2', enabled: false }],
    body: { type: 'json' as const, text: '{"a":1}', form: [] },
    auth: { type: 'bearer' as const, token: 'tok' },
  };
  folder.items.push(request);
  collection.items.push(folder);
  collection.variables = [{ key: 'baseUrl', value: 'https://x.test', enabled: true }, { key: 'off', value: 'x', enabled: false }];
  return collection;
}

describe('buildPostmanExport', () => {
  const exported = buildPostmanExport(sampleCollection()) as any;

  it('writes v2.1 info and variables, dropping disabled ones', () => {
    expect(exported.info).toEqual({ _postman_id: 'c1', name: 'Sample', schema: POSTMAN_SCHEMA_V21 });
    expect(exported.variable).toEqual([{ key: 'baseUrl', value: 'https://x.test' }]);
  });

  it('exports folders and requests with url, query, headers, body and auth', () => {
    const request = exported.item[0].item[0].request;
    expect(exported.item[0].name).toBe('Folder');
    expect(request.method).toBe('POST');
    expect(request.url.raw).toBe('https://x.test/items?a%20b=1');
    expect(request.url.query).toEqual([{ key: 'a b', value: '1' }, { key: 'off', value: '2', disabled: true }]);
    expect(request.header).toEqual([{ key: 'X-A', value: '1' }, { key: 'X-B', value: '2', disabled: true }]);
    expect(request.body).toEqual({ mode: 'raw', raw: '{"a":1}', options: { raw: { language: 'json' } } });
    expect(request.auth).toEqual({ type: 'bearer', bearer: [{ key: 'token', value: 'tok', type: 'string' }] });
  });

  it('appends the query to urls that already have one', () => {
    const collection = createCollection('C', () => 'c');
    collection.items.push({ ...createRequest('R', () => 'r'), url: 'https://x.test?z=1', params: [{ key: 'a', value: '2', enabled: true }] });
    expect((buildPostmanExport(collection) as any).item[0].request.url.raw).toBe('https://x.test?z=1&a=2');
  });

  it('maps form, multipart, graphql and no body', () => {
    const collection = createCollection('C', () => 'c');
    const base = createRequest('R', () => 'r');
    collection.items.push(
      { ...base, body: { type: 'form', text: '', form: [{ key: 'a', value: 'b', enabled: true }] } },
      { ...base, body: { type: 'multipart', text: '', form: [], multipart: [{ key: 'f', kind: 'file', value: '/p', enabled: true }, { key: 't', kind: 'text', value: 'v', enabled: false }] } },
      { ...base, body: { type: 'graphql', text: '{ a }', form: [], graphqlVariables: '{}' } },
      base,
    );
    const requests = (buildPostmanExport(collection) as any).item.map((item: any) => item.request);
    expect(requests[0].body).toEqual({ mode: 'urlencoded', urlencoded: [{ key: 'a', value: 'b' }] });
    expect(requests[1].body.formdata).toEqual([{ key: 'f', type: 'file', src: '/p' }, { key: 't', type: 'text', value: 'v', disabled: true }]);
    expect(requests[2].body).toEqual({ mode: 'graphql', graphql: { query: '{ a }', variables: '{}' } });
    expect(requests[3].body).toBeUndefined();
    expect(requests[3].auth).toBeUndefined();
  });

  it('round-trips through the Postman importer', () => {
    const imported = importPostmanCollection(exported);
    expect(imported.name).toBe('Sample');
    expect(imported.variables).toEqual([{ key: 'baseUrl', value: 'https://x.test', enabled: true }]);
  });
});

describe('postman body, auth and environment round trip', () => {
  function roundTrip(request: ReturnType<typeof createRequest>) {
    const collection = createCollection('C', () => 'c');
    collection.items.push(request);
    const imported = importPostmanCollection(JSON.parse(JSON.stringify(buildPostmanExport(collection))), () => 'n');
    return imported.items[0] as ReturnType<typeof createRequest>;
  }
  const base = createRequest('R', () => 'r');

  it('round-trips multipart, graphql and binary bodies', () => {
    const multipart = { type: 'multipart' as const, text: '', form: [], multipart: [{ key: 'f', kind: 'file' as const, value: '/p', enabled: true }, { key: 't', kind: 'text' as const, value: 'v', enabled: false }] };
    expect(roundTrip({ ...base, body: multipart }).body).toEqual(multipart);
    const graphql = { type: 'graphql' as const, text: '{ a }', form: [], graphqlVariables: '{"x":1}' };
    expect(roundTrip({ ...base, body: graphql }).body).toEqual(graphql);
    const binary = { type: 'binary' as const, text: '', form: [], filePath: '/data.bin' };
    expect(roundTrip({ ...base, body: binary }).body).toEqual(binary);
  });

  it('round-trips bearer, basic and apikey auth', () => {
    const auths = [
      { type: 'bearer' as const, token: 't' },
      { type: 'basic' as const, username: 'u', password: 'p' },
      { type: 'apikey' as const, key: 'k', value: 'v', location: 'query' as const },
    ];
    auths.forEach((auth) => expect(roundTrip({ ...base, auth }).auth).toEqual(auth));
  });

  it('imports disabled and non-string collection variables', () => {
    const imported = importPostmanCollection({ info: { name: 'x' }, item: [], variable: [{ key: 'n', value: 5 }, { key: 'd', value: 'v', disabled: true }] });
    expect(imported.variables).toEqual([{ key: 'n', value: '5', enabled: true }, { key: 'd', value: 'v', enabled: false }]);
  });

  it('exports an environment as a Postman environment file', () => {
    const environment = { id: 'e', name: 'dev', variables: [{ key: 'a', value: '1', enabled: true }, { key: 's', value: 'x', enabled: false, secret: true }, { key: ' ', value: '', enabled: true }] };
    expect(buildPostmanEnvironment(environment)).toEqual({
      id: 'e',
      name: 'dev',
      values: [{ key: 'a', value: '1', type: 'default', enabled: true }, { key: 's', value: '', type: 'secret', enabled: false }],
      _postman_variable_scope: 'environment',
    });
  });
});
