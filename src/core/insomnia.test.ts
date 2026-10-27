import { describe, expect, it } from 'vitest';
import { isFolder } from './collectionTree';
import { importInsomnia, isInsomniaExport } from './insomnia';
import { FolderModel, RequestModel } from '../shared/types';

const sequentialIds = () => {
  let counter = 0;
  return () => `id-${++counter}`;
};

const exportFile = {
  _type: 'export',
  __export_format: 4,
  resources: [
    { _id: 'wrk_1', _type: 'workspace', name: 'My API' },
    { _id: 'fld_1', _type: 'request_group', parentId: 'wrk_1', name: 'Users', metaSortKey: 2 },
    { _id: 'fld_2', _type: 'request_group', parentId: 'fld_1', name: 'Nested', metaSortKey: 5 },
    {
      _id: 'req_1', _type: 'request', parentId: 'fld_1', name: 'Create', method: 'POST', url: '{{ _.baseUrl }}/users', metaSortKey: 1,
      headers: [{ name: 'X-A', value: '1' }, { name: 'X-B', value: '2', disabled: true }],
      parameters: [{ name: 'q', value: 'v' }],
      body: { mimeType: 'application/json', text: '{"a":1}' },
      authentication: { type: 'bearer', token: 'tok' },
    },
    { _id: 'req_2', _type: 'request', parentId: 'fld_2', name: 'Deep', method: 'get', url: 'https://x.test' },
    {
      _id: 'req_3', _type: 'request', parentId: 'wrk_1', name: 'Form', method: 'POST', url: 'https://x.test/form', metaSortKey: 1,
      body: { mimeType: 'application/x-www-form-urlencoded', params: [{ name: 'a', value: 'b' }, { name: 'c', value: 'd', disabled: true }] },
      authentication: { type: 'basic', username: 'u', password: 'p' },
    },
    { _id: 'req_4', _type: 'request', parentId: 'wrk_1', name: 'Off', url: 'u', metaSortKey: 1.5, authentication: { type: 'bearer', token: 't', disabled: true }, body: { mimeType: 'application/xml', text: '<a/>' } },
    { _id: 'env_base', _type: 'environment', parentId: 'wrk_1', name: 'Base Environment', data: { baseUrl: 'https://api.test', retries: 3, nested: { a: 1 }, nothing: null } },
    { _id: 'env_dev', _type: 'environment', parentId: 'env_base', name: 'Dev', data: { baseUrl: 'http://localhost' }, metaSortKey: 1 },
    { _id: 'env_prod', _type: 'environment', parentId: 'env_base', name: 'Prod', data: { baseUrl: 'https://prod.test' }, metaSortKey: 2 },
    { _id: 'jar_1', _type: 'cookie_jar', parentId: 'wrk_1' },
  ],
};

describe('isInsomniaExport', () => {
  it('recognises v4 exports only', () => {
    expect(isInsomniaExport(exportFile)).toBe(true);
    expect(isInsomniaExport({ _type: 'export' })).toBe(false);
    expect(isInsomniaExport({ resources: [] })).toBe(false);
  });
});

describe('importInsomnia', () => {
  const [collection] = importInsomnia(exportFile, sequentialIds());

  it('creates a collection per workspace', () => {
    expect(importInsomnia({ ...exportFile, resources: [] })).toEqual([]);
    const second = importInsomnia({ _type: 'export', resources: [{ _id: 'a', _type: 'workspace', name: 'A' }, { _id: 'b', _type: 'workspace', name: 'B' }] });
    expect(second.map((entry) => entry.name)).toEqual(['A', 'B']);
    expect(collection.name).toBe('My API');
  });

  it('maps request groups to nested folders and orders by metaSortKey', () => {
    expect(collection.items.map((entry) => entry.name)).toEqual(['Form', 'Off', 'Users']);
    const users = collection.items[2] as FolderModel;
    expect(users.items.map((entry) => entry.name)).toEqual(['Create', 'Nested']);
    const nested = users.items[1];
    expect(isFolder(nested) && (nested.items[0] as RequestModel).method).toBe('GET');
  });

  it('maps method, url, headers, params, body and auth', () => {
    const create = (collection.items[2] as FolderModel).items[0] as RequestModel;
    expect(create).toMatchObject({ method: 'POST', url: '{{ _.baseUrl }}/users', params: [{ key: 'q', value: 'v', enabled: true }] });
    expect(create.headers).toEqual([
      { key: 'X-A', value: '1', enabled: true },
      { key: 'X-B', value: '2', enabled: false },
    ]);
    expect(create.body).toEqual({ type: 'json', text: '{"a":1}', form: [] });
    expect(create.auth).toEqual({ type: 'bearer', token: 'tok' });
  });

  it('maps form bodies, basic auth, xml bodies and disabled auth', () => {
    const [form, off] = collection.items as RequestModel[];
    expect(form.body.form).toEqual([{ key: 'a', value: 'b', enabled: true }, { key: 'c', value: 'd', enabled: false }]);
    expect(form.auth).toEqual({ type: 'basic', username: 'u', password: 'p' });
    expect(off.auth).toEqual({ type: 'none' });
    expect(off.body).toMatchObject({ type: 'xml', text: '<a/>' });
  });

  it('maps the base environment to variables and sub environments to environments', () => {
    expect(collection.variables).toEqual([
      { key: 'baseUrl', value: 'https://api.test', enabled: true },
      { key: 'retries', value: '3', enabled: true },
      { key: 'nested', value: '{"a":1}', enabled: true },
      { key: 'nothing', value: '', enabled: true },
    ]);
    expect(collection.environments.map((environment) => environment.name)).toEqual(['Dev', 'Prod']);
    expect(collection.environments[0].variables).toEqual([{ key: 'baseUrl', value: 'http://localhost', enabled: true }]);
  });

  it('skips unknown resources and tolerates missing environments', () => {
    const [bare] = importInsomnia({ _type: 'export', resources: [{ _id: 'w', _type: 'workspace' }, { _id: 'j', _type: 'cookie_jar', parentId: 'w' }, 'junk'] });
    expect(bare).toMatchObject({ name: 'Insomnia Import', items: [], variables: [], environments: [] });
  });
});

describe('importInsomnia bodies and auth', () => {
  function importRequest(request: Record<string, unknown>) {
    const [collection] = importInsomnia({
      _type: 'export',
      resources: [{ _id: 'w', _type: 'workspace', name: 'W' }, { _id: 'r', _type: 'request', parentId: 'w', name: 'R', method: 'POST', url: 'u', ...request }],
    });
    return collection.items[0] as RequestModel;
  }

  it('maps multipart bodies with text and file params', () => {
    const request = importRequest({
      body: { mimeType: 'multipart/form-data', params: [{ name: 'a', value: '1' }, { name: 'f', type: 'file', fileName: '/p.png', disabled: true }, { value: 'nameless' }] },
    });
    expect(request.body).toEqual({
      type: 'multipart',
      text: '',
      form: [],
      multipart: [{ key: 'a', kind: 'text', value: '1', enabled: true }, { key: 'f', kind: 'file', value: '/p.png', enabled: false }],
    });
  });

  it('maps graphql bodies and binary file bodies', () => {
    const graphql = importRequest({ body: { mimeType: 'application/graphql', text: JSON.stringify({ query: '{ a }', variables: { x: 1 } }) } });
    expect(graphql.body).toEqual({ type: 'graphql', text: '{ a }', form: [], graphqlVariables: JSON.stringify({ x: 1 }, null, 2) });
    const rawGraphql = importRequest({ body: { mimeType: 'application/graphql', text: '{ b }' } });
    expect(rawGraphql.body).toMatchObject({ type: 'graphql', text: '{ b }' });
    const binary = importRequest({ body: { mimeType: 'application/octet-stream', fileName: '/f.bin' } });
    expect(binary.body).toMatchObject({ type: 'binary', filePath: '/f.bin' });
  });

  it('maps apikey and oauth2 authentication', () => {
    expect(importRequest({ authentication: { type: 'apikey', key: 'k', value: 'v', addTo: 'queryParams' } }).auth).toEqual({ type: 'apikey', key: 'k', value: 'v', location: 'query' });
    expect(importRequest({ authentication: { type: 'apikey', key: 'k', value: 'v' } }).auth).toMatchObject({ location: 'header' });
    const oauth = { type: 'oauth2', grantType: 'password', accessTokenUrl: 'https://t', clientId: 'c', clientSecret: 's', scope: 'a b', username: 'u', password: 'p' };
    expect(importRequest({ authentication: oauth }).auth).toEqual({
      type: 'oauth2', grant: 'password', tokenUrl: 'https://t', clientId: 'c', clientSecret: 's', scope: 'a b', username: 'u', password: 'p',
    });
    expect(importRequest({ authentication: { ...oauth, grantType: 'client_credentials' } }).auth).toMatchObject({ grant: 'client_credentials' });
    expect(importRequest({ authentication: { ...oauth, grantType: 'authorization_code' } }).auth).toEqual({ type: 'none' });
  });
});

