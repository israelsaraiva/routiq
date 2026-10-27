import { describe, expect, it } from 'vitest';
import { createRequest } from './factories';
import { prepareRequest } from './requestBuilder';

describe('prepareRequest', () => {
  it('substitutes variables and adds bearer auth', () => {
    const request = { ...createRequest('r'), url: '{{base}}/x', auth: { type: 'bearer' as const, token: '{{t}}' } };
    const prepared = prepareRequest(request, { base: 'http://h', t: 'abc' });
    expect(prepared.url).toBe('http://h/x');
    expect(prepared.headers['Authorization']).toBe('Bearer abc');
  });

  it('encodes basic auth', () => {
    const request = { ...createRequest('r'), auth: { type: 'basic' as const, username: 'u', password: 'p' } };
    expect(prepareRequest(request, {}).headers['Authorization']).toBe('Basic dTpw');
  });

  it('sets JSON body and content type for POST but not for GET', () => {
    const base = { ...createRequest('r'), body: { type: 'json' as const, text: '{"a":1}', form: [] } };
    const post = prepareRequest({ ...base, method: 'POST' }, {});
    expect(post.body).toBe('{"a":1}');
    expect(post.headers['Content-Type']).toBe('application/json');
    expect(prepareRequest(base, {}).body).toBeUndefined();
  });

  it('encodes form bodies and respects user content type', () => {
    const request = {
      ...createRequest('r'),
      method: 'POST' as const,
      headers: [{ key: 'content-type', value: 'x/y', enabled: true }],
      body: { type: 'form' as const, text: '', form: [{ key: 'a', value: 'b c', enabled: true }] },
    };
    const prepared = prepareRequest(request, {});
    expect(prepared.body).toBe('a=b%20c');
    expect(prepared.headers['Content-Type']).toBeUndefined();
  });

  it('adds API key as header or query param', () => {
    const base = createRequest('r');
    const header = prepareRequest({ ...base, url: 'http://h', auth: { type: 'apikey', key: 'X-Key', value: '{{k}}', location: 'header' } }, { k: 'v' });
    expect(header.headers['X-Key']).toBe('v');
    const query = prepareRequest({ ...base, url: 'http://h?a=1', auth: { type: 'apikey', key: 'api key', value: 'v 1', location: 'query' } }, {});
    expect(query.url).toBe('http://h?a=1&api%20key=v%201');
  });

  it('uses the supplied OAuth authorization and exposes digest credentials', () => {
    const oauth = { type: 'oauth2' as const, grant: 'client_credentials' as const, tokenUrl: '', clientId: '', clientSecret: '', scope: '', username: '', password: '' };
    const prepared = prepareRequest({ ...createRequest('r'), auth: oauth }, {}, { oauthAuthorization: 'Bearer tok' });
    expect(prepared.headers['Authorization']).toBe('Bearer tok');
    const digest = prepareRequest({ ...createRequest('r'), auth: { type: 'digest', username: '{{u}}', password: 'p' } }, { u: 'me' });
    expect(digest.digest).toEqual({ username: 'me', password: 'p' });
    expect(digest.headers['Authorization']).toBeUndefined();
  });
});

describe('prepareRequest body types', () => {
  const post = { ...createRequest('r'), method: 'POST' as const };

  it('sends XML with an xml content type', () => {
    const prepared = prepareRequest({ ...post, body: { type: 'xml', text: '<a>{{v}}</a>', form: [] } }, { v: '1' });
    expect(prepared.body).toBe('<a>1</a>');
    expect(prepared.headers['Content-Type']).toBe('application/xml');
  });

  it('wraps GraphQL query and variables as JSON', () => {
    const body = { type: 'graphql' as const, text: '{ me { {{f}} } }', form: [], graphqlVariables: '{"id":"{{id}}"}' };
    const prepared = prepareRequest({ ...post, body }, { f: 'name', id: '7' });
    expect(JSON.parse(prepared.body ?? '')).toEqual({ query: '{ me { name } }', variables: { id: '7' } });
    expect(prepared.headers['Content-Type']).toBe('application/json');
  });

  it('omits empty or invalid GraphQL variables', () => {
    const body = { type: 'graphql' as const, text: '{ a }', form: [], graphqlVariables: '{oops' };
    expect(JSON.parse(prepareRequest({ ...post, body }, {}).body ?? '')).toEqual({ query: '{ a }' });
  });

  it('prepares enabled multipart parts without a content type', () => {
    const multipart = [
      { key: 'name', kind: 'text' as const, value: '{{n}}', enabled: true },
      { key: 'file', kind: 'file' as const, value: '/tmp/a.png', enabled: true },
      { key: 'off', kind: 'text' as const, value: 'x', enabled: false },
    ];
    const prepared = prepareRequest({ ...post, body: { type: 'multipart', text: '', form: [], multipart } }, { n: 'v' });
    expect(prepared.multipart).toEqual([
      { kind: 'text', name: 'name', value: 'v' },
      { kind: 'file', name: 'file', filePath: '/tmp/a.png' },
    ]);
    expect(prepared.headers['Content-Type']).toBeUndefined();
  });

  it('references the binary file path', () => {
    const prepared = prepareRequest({ ...post, body: { type: 'binary', text: '', form: [], filePath: '/x/y.bin' } }, {});
    expect(prepared.bodyFilePath).toBe('/x/y.bin');
    expect(prepared.headers['Content-Type']).toBe('application/octet-stream');
  });
});
