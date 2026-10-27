import { describe, expect, it } from 'vitest';
import { createRequest } from './factories';
import { applyCurlToRequest, extractPastedCurlCommand, importPastedCurl, splitUrlQuery } from './curlPaste';

const existing = {
  ...createRequest('My request', () => 'req-1'),
  method: 'DELETE' as const,
  url: 'https://old.example.com',
  params: [{ key: 'stale', value: '1', enabled: false }],
  headers: [{ key: 'X-Old', value: 'x', enabled: false }],
  timeoutMs: 5000,
};

describe('extractPastedCurlCommand', () => {
  it('detects curl commands and ignores other text', () => {
    expect(extractPastedCurlCommand("  curl -X POST https://a.test \\\n -d 'x'  ")).toContain('curl -X POST');
    expect(extractPastedCurlCommand('https://a.test/curl')).toBeUndefined();
    expect(extractPastedCurlCommand('{"a":1}')).toBeUndefined();
  });
});

describe('splitUrlQuery', () => {
  it('moves the query into params and keeps the fragment', () => {
    expect(splitUrlQuery('https://a.test/p?x=1&y=a%20b&flag#top')).toEqual({
      baseUrl: 'https://a.test/p#top',
      params: [
        { key: 'x', value: '1', enabled: true },
        { key: 'y', value: 'a b', enabled: true },
        { key: 'flag', value: '', enabled: true },
      ],
    });
  });

  it('leaves variables untouched', () => {
    const { baseUrl, params } = splitUrlQuery('{{host}}/p?token={{token}}');
    expect(baseUrl).toBe('{{host}}/p');
    expect(params[0]).toEqual({ key: 'token', value: '{{token}}', enabled: true });
  });
});

describe('importPastedCurl', () => {
  it('applies method, url, params, headers and body while keeping identity', () => {
    const { request } = importPastedCurl(existing, `curl -X POST 'https://httpbin.org/post?a=1' -H 'Content-Type: application/json' -d '{"a":1}'`);
    expect(request).toMatchObject({ id: 'req-1', name: 'My request', timeoutMs: 5000, method: 'POST', url: 'https://httpbin.org/post' });
    expect(request.params).toEqual([{ key: 'a', value: '1', enabled: true }]);
    expect(request.body).toMatchObject({ type: 'json', text: '{"a":1}' });
    expect(request.headers.some((header) => header.key === 'X-Old')).toBe(false);
  });

  it('maps basic and bearer auth', () => {
    expect(importPastedCurl(existing, 'curl -u me:secret https://a.test').request.auth).toMatchObject({ type: 'basic' });
    expect(importPastedCurl(existing, "curl -H 'Authorization: Bearer {{token}}' https://a.test").request.auth).toMatchObject({ type: 'bearer', token: '{{token}}' });
  });

  it('reports warnings and rejects invalid commands', () => {
    expect(importPastedCurl(existing, 'curl -X TRACE https://a.test').warnings.length).toBeGreaterThan(0);
    expect(() => importPastedCurl(existing, 'curl')).toThrow();
  });

  it('switches kind with the parsed body', () => {
    const graphql = importPastedCurl(existing, `curl https://a.test/graphql -d '{"query":"{ a }"}' -H 'Content-Type: application/json'`).request;
    expect(graphql.kind).toBe('graphql');
    const plain = applyCurlToRequest(graphql, { request: { ...existing, url: 'https://b.test' }, warnings: [] });
    expect(plain.kind).toBeUndefined();
    expect(plain.id).toBe('req-1');
  });
});
