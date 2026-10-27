import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { isFolder } from './collectionTree';
import { importOpenApi, isOpenApiDocument, resolveBaseUrl, toRequestPath } from './openapi';
import { exampleValue, createRefResolver } from './openapiSchemaExample';
import { FolderModel, RequestModel } from '../shared/types';

const sequentialIds = () => {
  let counter = 0;
  return () => `id-${++counter}`;
};

const petstore = {
  openapi: '3.0.3',
  info: { title: 'Petstore' },
  servers: [{ url: 'https://{env}.pets.test/v1/', variables: { env: { default: 'api' } } }],
  paths: {
    '/pets': {
      get: {
        tags: ['pets'],
        summary: 'List pets',
        parameters: [
          { name: 'limit', in: 'query', required: true, schema: { type: 'integer', default: 10 } },
          { name: 'tag', in: 'query', schema: { type: 'string' } },
          { name: 'X-Trace', in: 'header', schema: { type: 'string', example: 'abc' } },
        ],
      },
      post: {
        tags: ['pets'],
        operationId: 'createPet',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
      },
    },
    '/pets/{petId}': {
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer' } }],
      delete: { tags: ['pets', 'admin'] },
    },
    '/health': { get: {} },
    '/login': {
      post: {
        tags: ['auth'],
        requestBody: {
          content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { user: { type: 'string' }, age: { type: 'integer' } } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['name'],
        properties: {
          id: { type: 'integer', readOnly: true },
          name: { type: 'string', example: 'Rex' },
          tags: { type: 'array', items: { type: 'string' } },
          owner: { $ref: '#/components/schemas/Owner' },
        },
      },
      Owner: { type: 'object', properties: { email: { type: 'string', format: 'email' }, pet: { $ref: '#/components/schemas/Pet' } } },
    },
  },
};

function importPetstore() {
  return importOpenApi(petstore, sequentialIds());
}

function folderNamed(name: string): FolderModel {
  const folder = importPetstore().items.find((entry) => isFolder(entry) && entry.name === name);
  return folder as FolderModel;
}

describe('isOpenApiDocument', () => {
  it('accepts OpenAPI 3.x and Swagger 2.0 documents with paths', () => {
    expect(isOpenApiDocument({ openapi: '3.1.0', paths: {} })).toBe(true);
    expect(isOpenApiDocument({ swagger: '2.0', paths: {} })).toBe(true);
  });

  it('rejects other documents', () => {
    expect(isOpenApiDocument({ openapi: '3.0.0' })).toBe(false);
    expect(isOpenApiDocument({ swagger: '1.2', paths: {} })).toBe(false);
    expect(isOpenApiDocument({ info: {}, item: [] })).toBe(false);
  });
});

describe('base url and paths', () => {
  it('uses servers[0] with variable defaults and no trailing slash', () => {
    expect(resolveBaseUrl(petstore)).toBe('https://api.pets.test/v1');
  });

  it('builds the base url from Swagger 2.0 scheme, host and basePath', () => {
    expect(resolveBaseUrl({ swagger: '2.0', schemes: ['http'], host: 'h.test', basePath: '/api' })).toBe('http://h.test/api');
    expect(resolveBaseUrl({ swagger: '2.0', host: 'h.test' })).toBe('https://h.test');
    expect(resolveBaseUrl({ swagger: '2.0', basePath: '/api' })).toBe('/api');
  });

  it('returns an empty base url when no server is declared', () => {
    expect(resolveBaseUrl({ openapi: '3.0.0', paths: {} })).toBe('');
  });

  it('converts path parameters to variables', () => {
    expect(toRequestPath('/a/{x}/b/{y}')).toBe('/a/{{x}}/b/{{y}}');
  });
});

describe('importOpenApi', () => {
  it('names the collection from info.title and stores baseUrl variable', () => {
    const collection = importPetstore();
    expect(collection.name).toBe('Petstore');
    expect(collection.variables).toEqual([{ key: 'baseUrl', value: 'https://api.pets.test/v1', enabled: true }]);
  });

  it('creates one folder per first tag and keeps untagged requests at the root', () => {
    const { items } = importPetstore();
    expect(items.map((entry) => entry.name)).toEqual(['pets', 'GET /health', 'auth']);
    expect(folderNamed('pets').items.map((entry) => entry.name)).toEqual(['List pets', 'createPet', 'DELETE /pets/{petId}']);
  });

  it('builds methods, urls, query params and headers', () => {
    const [list] = folderNamed('pets').items as RequestModel[];
    expect(list.method).toBe('GET');
    expect(list.url).toBe('{{baseUrl}}/pets');
    expect(list.params).toEqual([
      { key: 'limit', value: '10', enabled: true },
      { key: 'tag', value: 'string', enabled: false },
    ]);
    expect(list.headers).toEqual([{ key: 'X-Trace', value: 'abc', enabled: false }]);
    expect(list.body.type).toBe('none');
  });

  it('turns path parameters into variables, including path-level definitions', () => {
    const remove = folderNamed('pets').items[2] as RequestModel;
    expect(remove.url).toBe('{{baseUrl}}/pets/{{petId}}');
    expect(remove.method).toBe('DELETE');
  });

  it('generates json bodies from referenced schemas, skipping read-only and cyclic data', () => {
    const create = folderNamed('pets').items[1] as RequestModel;
    expect(create.body.type).toBe('json');
    const body = JSON.parse(create.body.text);
    expect(body.id).toBeUndefined();
    expect(body.name).toBe('Rex');
    expect(body.tags).toEqual(['string']);
    expect(body.owner.email).toBe('user@example.com');
    expect(create.headers).toContainEqual({ key: 'Content-Type', value: 'application/json', enabled: true });
  });

  it('turns urlencoded schemas into form fields', () => {
    const [login] = folderNamed('auth').items as RequestModel[];
    expect(login.body.type).toBe('form');
    expect(login.body.form).toEqual([
      { key: 'user', value: 'string', enabled: true },
      { key: 'age', value: '0', enabled: true },
    ]);
  });

  it('prefers media-type examples over generated ones', () => {
    const collection = importOpenApi({
      openapi: '3.0.0',
      paths: { '/x': { put: { requestBody: { content: { 'application/json': { example: { a: 1 }, schema: { type: 'object' } } } } } } },
    });
    expect((collection.items[0] as RequestModel).body.text).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('imports plain text and xml bodies', () => {
    const collection = importOpenApi({
      openapi: '3.0.0',
      paths: {
        '/t': { post: { requestBody: { content: { 'text/plain': { example: 'hello' } } } } },
        '/x': { post: { requestBody: { content: { 'application/xml': { example: '<a/>' } } } } },
      },
    });
    const [text, xml] = collection.items as RequestModel[];
    expect(text.body).toMatchObject({ type: 'text', text: 'hello' });
    expect(xml.body).toMatchObject({ type: 'xml', text: '<a/>' });
  });

  it('resolves $ref parameters and lets operation parameters override path ones', () => {
    const collection = importOpenApi({
      openapi: '3.0.0',
      components: { parameters: { Page: { name: 'page', in: 'query', required: true, example: 2 } } },
      paths: {
        '/a': {
          parameters: [{ $ref: '#/components/parameters/Page' }, { name: 'q', in: 'query', example: 'old' }],
          get: { parameters: [{ name: 'q', in: 'query', required: true, example: 'new' }] },
        },
      },
    });
    expect((collection.items[0] as RequestModel).params).toEqual([
      { key: 'page', value: '2', enabled: true },
      { key: 'q', value: 'new', enabled: true },
    ]);
  });

  it('ignores unknown path keys and falls back to a default title', () => {
    const collection = importOpenApi({ openapi: '3.0.0', paths: { '/a': { summary: 'x', 'x-foo': {}, get: {} } } });
    expect(collection.name).toBe('OpenAPI Import');
    expect(collection.items).toHaveLength(1);
  });

  it('imports Swagger 2.0 body and formData parameters', () => {
    const collection = importOpenApi({
      swagger: '2.0',
      info: { title: 'Legacy' },
      host: 'old.test',
      basePath: '/v2',
      definitions: { Item: { type: 'object', properties: { n: { type: 'integer' } } } },
      paths: {
        '/items': { post: { parameters: [{ in: 'body', name: 'body', schema: { $ref: '#/definitions/Item' } }] } },
        '/upload': { post: { parameters: [{ in: 'formData', name: 'title', type: 'string' }] } },
      },
    });
    const [items, upload] = collection.items as RequestModel[];
    expect(collection.variables[0].value).toBe('https://old.test/v2');
    expect(JSON.parse(items.body.text)).toEqual({ n: 0 });
    expect(upload.body.form).toEqual([{ key: 'title', value: 'string', enabled: true }]);
  });

  it('imports YAML documents parsed with the yaml package', () => {
    const document = parse(`
openapi: 3.0.0
info:
  title: Yaml API
servers:
  - url: http://localhost:3000
paths:
  /users/{id}:
    get:
      tags: [users]
      summary: Get user
`);
    const collection = importOpenApi(document);
    expect(collection.name).toBe('Yaml API');
    expect(((collection.items[0] as FolderModel).items[0] as RequestModel).url).toBe('{{baseUrl}}/users/{{id}}');
  });
});

describe('exampleValue', () => {
  const resolve = createRefResolver({});

  it('honours example, default and enum in that order', () => {
    expect(exampleValue({ type: 'string', example: 'e', default: 'd' }, resolve)).toBe('e');
    expect(exampleValue({ type: 'string', default: 'd', enum: ['x'] }, resolve)).toBe('d');
    expect(exampleValue({ type: 'string', enum: ['x', 'y'] }, resolve)).toBe('x');
  });

  it('generates primitives and formats', () => {
    expect(exampleValue({ type: 'boolean' }, resolve)).toBe(true);
    expect(exampleValue({ type: 'number' }, resolve)).toBe(0);
    expect(exampleValue({ type: 'string', format: 'date-time' }, resolve)).toBe('2024-01-01T00:00:00Z');
    expect(exampleValue({ type: ['null', 'integer'] }, resolve)).toBe(0);
  });

  it('merges allOf and picks the first oneOf', () => {
    const schema = { allOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { properties: { b: { type: 'boolean' } } }] };
    expect(exampleValue(schema, resolve)).toEqual({ a: 'string', b: true });
    expect(exampleValue({ oneOf: [{ type: 'integer' }, { type: 'string' }] }, resolve)).toBe(0);
  });

  it('terminates on self-referencing schemas', () => {
    const root = { node: { type: 'object', properties: { next: { $ref: '#/node' } } } };
    expect(() => exampleValue({ $ref: '#/node' }, createRefResolver(root))).not.toThrow();
  });

  it('returns null for non-schemas', () => {
    expect(exampleValue(undefined, resolve)).toBeNull();
  });
});

describe('importOpenApi security and multipart', () => {
  const securedDocument = {
    openapi: '3.0.0',
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        basicAuth: { type: 'http', scheme: 'basic' },
        keyAuth: { type: 'apiKey', in: 'query', name: 'api_key' },
        headerKey: { $ref: '#/components/securitySchemes/keyAuthHeader' },
        keyAuthHeader: { type: 'apiKey', in: 'header', name: 'X-Key' },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/default': { get: {} },
      '/basic': { get: { security: [{ basicAuth: [] }] } },
      '/query': { get: { security: [{ keyAuth: [] }] } },
      '/ref': { get: { security: [{ headerKey: [] }] } },
      '/open': { get: { security: [] } },
    },
  };

  it('maps http and apiKey security schemes to request auth', () => {
    const collection = importOpenApi(securedDocument);
    const auths = (collection.items as RequestModel[]).map((request) => request.auth);
    expect(auths).toEqual([
      { type: 'bearer', token: '{{bearerToken}}' },
      { type: 'basic', username: '{{username}}', password: '{{password}}' },
      { type: 'apikey', key: 'api_key', value: '{{apiKey}}', location: 'query' },
      { type: 'apikey', key: 'X-Key', value: '{{apiKey}}', location: 'header' },
      { type: 'none' },
    ]);
    expect(collection.variables.map((variable) => variable.key)).toEqual(['baseUrl', 'bearerToken', 'username', 'password', 'apiKey']);
  });

  it('maps Swagger 2.0 basic and apiKey definitions', () => {
    const collection = importOpenApi({
      swagger: '2.0',
      securityDefinitions: { b: { type: 'basic' }, k: { type: 'apiKey', in: 'header', name: 'X-K' } },
      paths: { '/a': { get: { security: [{ b: [] }] } }, '/b': { get: { security: [{ k: [] }] } } },
    });
    expect((collection.items as RequestModel[]).map((request) => request.auth.type)).toEqual(['basic', 'apikey']);
  });

  it('imports multipart/form-data bodies with file and text fields', () => {
    const collection = importOpenApi({
      openapi: '3.0.0',
      paths: {
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: { title: { type: 'string', example: 'hi' }, file: { type: 'string', format: 'binary' }, files: { type: 'array', items: { type: 'string', format: 'binary' } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const [upload] = collection.items as RequestModel[];
    expect(upload.body.type).toBe('multipart');
    expect(upload.body.multipart).toEqual([
      { key: 'title', kind: 'text', value: 'hi', enabled: true },
      { key: 'file', kind: 'file', value: '', enabled: true },
      { key: 'files', kind: 'file', value: '', enabled: true },
    ]);
  });

  it('imports Swagger 2.0 file formData parameters as multipart', () => {
    const collection = importOpenApi({
      swagger: '2.0',
      paths: { '/u': { post: { parameters: [{ in: 'formData', name: 'doc', type: 'file' }, { in: 'formData', name: 'note', type: 'string' }] } } },
    });
    const [upload] = collection.items as RequestModel[];
    expect(upload.body.multipart?.map((field) => [field.key, field.kind])).toEqual([['doc', 'file'], ['note', 'text']]);
  });
});

