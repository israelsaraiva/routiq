import { describe, expect, it } from 'vitest';
import { detectImportFormat } from './importDetection';
import { formatSummaryDetails, formatSummaryMessage, summarizeImport } from './importReport';
import { importPostmanCollection } from './postman';
import { importPostmanEnvironment, withAddedEnvironment } from './postmanEnvironment';
import { importInsomnia } from './insomnia';
import { importOpenApi } from './openapi';
import { createCollection } from './factories';
import { RequestModel } from '../shared/types';

function requestsOf(collection: { items: unknown[] }): RequestModel[] {
  return collection.items as RequestModel[];
}

describe('postman scripts and auth import', () => {
  const source = {
    info: { name: 'C' },
    event: [{ listen: 'prerequest', script: { exec: ['x'] } }],
    item: [
      {
        name: 'Folder',
        item: [
          {
            name: 'Login',
            event: [
              { listen: 'prerequest', script: { exec: ['pm.environment.set("t", "1");'] } },
              { listen: 'test', script: { exec: ['pm.test("ok", function () {', '  pm.response.to.have.status(200);', '});', 'pm.sendRequest("u");'] } },
            ],
            request: {
              method: 'GET',
              url: 'https://x.test',
              auth: { type: 'oauth2', oauth2: [{ key: 'grant_type', value: 'client_credentials' }, { key: 'accessTokenUrl', value: 'https://t' }, { key: 'clientId', value: 'id' }, { key: 'clientSecret', value: 's' }, { key: 'scope', value: 'a b' }] },
            },
          },
          { name: 'Dig', request: { method: 'GET', url: 'u', auth: { type: 'digest', digest: [{ key: 'username', value: 'me' }, { key: 'password', value: 'pw' }] } } },
          { name: 'Hawk', request: { method: 'GET', url: 'u', auth: { type: 'hawk', hawk: [] } } },
        ],
      },
    ],
  };

  it('imports scripts, oauth2 and digest auth and reports warnings', () => {
    const warnings: string[] = [];
    const collection = importPostmanCollection(source, undefined, warnings);
    const [login, digest, hawk] = requestsOf(collection.items[0] as { items: unknown[] });
    expect(login.scripts?.pre).toBe('x\nrq.variables.set("t", "1");');
    expect(login.scripts?.post).toContain('// [not translated] pm.sendRequest("u");');
    expect(login.auth).toMatchObject({ type: 'oauth2', grant: 'client_credentials', tokenUrl: 'https://t', clientId: 'id', scope: 'a b' });
    expect(digest.auth).toEqual({ type: 'digest', username: 'me', password: 'pw' });
    expect(hawk.auth).toEqual({ type: 'none' });
    expect(warnings).toHaveLength(2);
    expect(warnings.join('\n')).toContain('"Hawk": auth type "hawk"');
  });
});

describe('postman collection and folder scripts', () => {
  const script = (listen: string, line: string) => ({ listen, script: { exec: [line] } });
  const source = {
    info: { name: 'C' },
    event: [script('prerequest', 'pm.variables.set("a", "1");'), script('test', 'pm.test("collection", function () {});')],
    item: [
      {
        name: 'Folder',
        event: [script('prerequest', 'pm.variables.set("b", "2");'), script('test', 'pm.test("folder", function () {});')],
        item: [{ name: 'R', request: { method: 'GET', url: 'u' }, event: [script('prerequest', 'pm.variables.set("c", "3");'), script('test', 'pm.test("own", function () {});')] }],
      },
    ],
  };

  it('prepends pre-request scripts outermost first and appends test scripts innermost first', () => {
    const [folder] = importPostmanCollection(source).items as unknown as Array<{ items: RequestModel[] }>;
    const { scripts } = folder.items[0];
    expect(scripts?.pre).toBe('rq.variables.set("a", "1");\nrq.variables.set("b", "2");\nrq.variables.set("c", "3");');
    expect(scripts?.post.match(/"(own|folder|collection)"/g)).toEqual(['"own"', '"folder"', '"collection"']);
  });

  it('keeps translation warnings for inherited scripts', () => {
    const warnings: string[] = [];
    importPostmanCollection({ ...source, event: [script('prerequest', 'pm.sendRequest("u");')] }, undefined, warnings);
    expect(warnings.join('\n')).toContain('collection C');
  });
});

describe('postman environment import', () => {
  const file = { id: 'e', name: 'Dev', values: [{ key: 'a', value: '1', enabled: true }, { key: 'k', value: 'v', type: 'secret', enabled: false }], _postman_variable_scope: 'environment' };

  it('is detected and converted with secret and enabled flags', () => {
    const detection = detectImportFormat(JSON.stringify(file));
    expect(detection.kind).toBe('postman-environment');
    const environment = importPostmanEnvironment(file, () => 'id1');
    expect(environment).toEqual({
      id: 'id1',
      name: 'Dev',
      variables: [
        { key: 'a', value: '1', enabled: true },
        { key: 'k', value: 'v', enabled: false, secret: true },
      ],
    });
  });

  it('appends to the existing environments of a collection', () => {
    const collection = { ...createCollection('C'), environments: [{ id: 'x', name: 'Old', variables: [] }], activeEnvironmentId: 'x' };
    const draft = withAddedEnvironment(collection, { id: 'y', name: 'New', variables: [] });
    expect(draft.environments.map((environment) => environment.id)).toEqual(['x', 'y']);
    expect(draft.activeEnvironmentId).toBe('x');
  });
});

describe('insomnia private environments', () => {
  it('marks variables of private environments and secret pairs as secret', () => {
    const [collection] = importInsomnia({
      _type: 'export',
      resources: [
        { _id: 'w', _type: 'workspace', name: 'W' },
        { _id: 'b', _type: 'environment', parentId: 'w', data: { a: '1' } },
        { _id: 's', _type: 'environment', parentId: 'b', name: 'Private', isPrivate: true, data: { token: 't' } },
        { _id: 'p', _type: 'environment', parentId: 'b', name: 'Pairs', kvPairData: [{ name: 'x', value: '1', type: 'str' }, { name: 'y', value: '2', type: 'secret' }] },
      ],
    });
    expect(collection.environments[0].variables).toEqual([{ key: 'token', value: 't', enabled: true, secret: true }]);
    expect(collection.environments[1].variables).toEqual([
      { key: 'x', value: '1', enabled: true },
      { key: 'y', value: '2', enabled: true, secret: true },
    ]);
  });
});

describe('openapi oauth2 security', () => {
  it('maps client credentials, password and authorization code flows and skips unusable alternatives', () => {
    const collection = importOpenApi({
      openapi: '3.0.0',
      components: {
        securitySchemes: {
          cc: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://auth/token', scopes: { read: 'r', write: 'w' } } } },
          pw: { type: 'oauth2', flows: { password: { tokenUrl: 'https://auth/pw', scopes: {} } } },
          code: { type: 'oauth2', flows: { authorizationCode: { authorizationUrl: 'a', tokenUrl: 't', scopes: {} } } },
          oidc: { type: 'openIdConnect', openIdConnectUrl: 'https://auth/.well-known/openid-configuration' },
          implicit: { type: 'oauth2', flows: { implicit: { authorizationUrl: 'a', scopes: {} } } },
        },
      },
      paths: {
        '/a': { get: { security: [{ oidc: [] }, { implicit: [] }, { cc: ['read'] }] } },
        '/b': { get: { security: [{ pw: [] }] } },
        '/c': { get: { security: [{ code: [] }] } },
        '/d': { get: { security: [{ implicit: [] }] } },
      },
    }, undefined, []);
    const [a, b, c, d] = requestsOf(collection);
    expect(a.auth).toMatchObject({ type: 'oauth2', grant: 'client_credentials', tokenUrl: 'https://auth/token', scope: 'read', clientId: '{{clientId}}' });
    expect(b.auth).toMatchObject({ grant: 'password', username: '{{username}}' });
    expect(c.auth).toMatchObject({ grant: 'authorization_code', authUrl: 'a', usePkce: true });
    expect(d.auth.type).toBe('none');
    expect(collection.variables.map((variable) => variable.key)).toEqual(expect.arrayContaining(['clientId', 'clientSecret', 'username', 'password']));
  });
});

describe('import summary', () => {
  it('counts nested folders and requests and lists warnings', () => {
    const collection = importPostmanCollection({ info: { name: 'C' }, item: [{ name: 'F', item: [{ name: 'F2', item: [{ name: 'r', request: { method: 'GET', url: 'u' } }] }, { name: 'r2', request: { url: 'u' } }] }] });
    const summary = summarizeImport([collection], ['careful']);
    expect(summary).toMatchObject({ collections: 1, folders: 2, requests: 2, warnings: ['careful'] });
    expect(formatSummaryMessage(summary)).toBe('Imported 1 collection, 2 folders, 2 requests, 1 warning.');
    expect(formatSummaryDetails(summary).slice(-2)).toEqual(['Warnings:', '  - careful']);
  });
});
