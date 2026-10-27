import { describe, expect, it } from 'vitest';
import { CurlParseError, curlGenerationWarnings, generateCurlCommand, parseCurlCommand } from './curl';
import { parseOwnCollection } from './collectionFormat';
import { createCollection, createRequest } from './factories';
import { serializeCollection } from './serialization';
import { prepareRequest } from './requestBuilder';

const parse = (command: string) => parseCurlCommand(command, () => 'id');
const enabled = (key: string, value: string) => ({ key, value, enabled: true });

describe('parseCurlCommand basics', () => {
  it('parses a plain GET', () => {
    const { request, warnings } = parse('curl https://api.example.com/users?x=1');
    expect(request).toMatchObject({ method: 'GET', url: 'https://api.example.com/users?x=1', name: 'GET /users' });
    expect(request.body.type).toBe('none');
    expect(warnings).toEqual([]);
  });

  it('accepts a shell prompt prefix, curl.exe and --url', () => {
    expect(parse('$ curl https://a.test/x').request.url).toBe('https://a.test/x');
    expect(parse('curl.exe https://a.test/x').request.url).toBe('https://a.test/x');
    expect(parse('curl --url https://a.test/y').request.url).toBe('https://a.test/y');
  });

  it('names the request after the host for root paths and handles variable urls', () => {
    expect(parse('curl https://a.test/').request.name).toBe('GET a.test');
    expect(parse("curl '{{base}}/users?x=1'").request.name).toBe('GET {{base}}/users');
  });

  it('rejects non-curl input and missing urls', () => {
    expect(() => parse('wget http://x')).toThrow(CurlParseError);
    expect(() => parse('curl -X POST')).toThrow('No URL');
    expect(() => parse("curl 'unterminated")).toThrow(CurlParseError);
    expect(() => parse('curl -H')).toThrow('Missing value');
  });

  it('ignores a trailing pipe', () => {
    expect(parse('curl https://a.test | jq .').request.url).toBe('https://a.test');
  });

  it('ignores flags and options with values that are irrelevant', () => {
    const { request } = parse('curl -sSLk --compressed -o out.txt --max-time 5 --connect-timeout=3 https://a.test');
    expect(request.url).toBe('https://a.test');
    expect(request.method).toBe('GET');
  });
});

describe('parseCurlCommand methods and headers', () => {
  it('reads -X in separate, attached and long forms', () => {
    expect(parse('curl -X DELETE https://a.test').request.method).toBe('DELETE');
    expect(parse('curl -XPUT https://a.test').request.method).toBe('PUT');
    expect(parse('curl --request patch https://a.test').request.method).toBe('PATCH');
    expect(parse('curl --request=OPTIONS https://a.test').request.method).toBe('OPTIONS');
  });

  it('maps -I/--head to HEAD', () => {
    expect(parse('curl -I https://a.test').request.method).toBe('HEAD');
    expect(parse('curl --head https://a.test').request.method).toBe('HEAD');
  });

  it('falls back to GET with a warning for unsupported methods', () => {
    const { request, warnings } = parse('curl -X TRACE https://a.test');
    expect(request.method).toBe('GET');
    expect(warnings[0]).toContain('TRACE');
  });

  it('collects headers, trims values, skips empty ones and keeps colons in values', () => {
    const { request } = parse(`curl -H 'Accept: text/html' -H "X-Time: 10:20:30" -H 'X-Empty:' -H 'Malformed' --header 'X-Long:v' https://a.test`);
    expect(request.headers).toEqual([enabled('Accept', 'text/html'), enabled('X-Time', '10:20:30'), enabled('X-Long', 'v')]);
  });

  it('maps -A, -e and -b to headers', () => {
    const { request } = parse(`curl -A 'agent/1' -e https://ref.test -b 'a=1; b=2' -b cookies.txt https://a.test`);
    expect(request.headers).toEqual([enabled('User-Agent', 'agent/1'), enabled('Referer', 'https://ref.test'), enabled('Cookie', 'a=1; b=2')]);
  });

  it('combines short flag clusters with a trailing option', () => {
    const { request } = parse(`curl -sSXPOST -H'X-A: 1' https://a.test`);
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual([enabled('X-A', '1')]);
  });
});

describe('parseCurlCommand auth', () => {
  it('maps -u to basic auth, splitting on the first colon only', () => {
    expect(parse('curl -u user:pa:ss https://a.test').request.auth).toEqual({ type: 'basic', username: 'user', password: 'pa:ss' });
    expect(parse('curl -uonly https://a.test').request.auth).toEqual({ type: 'basic', username: 'only', password: '' });
    expect(parse('curl --user a:b https://a.test').request.auth).toEqual({ type: 'basic', username: 'a', password: 'b' });
  });

  it('converts a bearer Authorization header into bearer auth', () => {
    const { request } = parse(`curl -H 'authorization: Bearer abc.def' https://a.test`);
    expect(request.auth).toEqual({ type: 'bearer', token: 'abc.def' });
    expect(request.headers).toEqual([]);
  });

  it('keeps a non-bearer Authorization header as a header', () => {
    const { request } = parse(`curl -H 'Authorization: Token xyz' https://a.test`);
    expect(request.auth).toEqual({ type: 'none' });
    expect(request.headers).toEqual([enabled('Authorization', 'Token xyz')]);
  });

  it('supports --oauth2-bearer', () => {
    expect(parse('curl --oauth2-bearer tok https://a.test').request.auth).toEqual({ type: 'bearer', token: 'tok' });
  });
});

describe('parseCurlCommand bodies', () => {
  it('implies POST for -d and infers JSON from the content type, dropping the redundant header', () => {
    const { request } = parse(`curl -H 'Content-Type: application/json' -d '{"a":1}' https://a.test`);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({ type: 'json', text: '{"a":1}', form: [] });
    expect(request.headers).toEqual([]);
  });

  it('keeps a json content type that carries parameters or a vendor type', () => {
    const withCharset = parse(`curl -H 'Content-Type: application/json; charset=utf-8' -d '{}' https://a.test`).request;
    expect(withCharset.body.type).toBe('json');
    expect(withCharset.headers).toEqual([enabled('Content-Type', 'application/json; charset=utf-8')]);
    const vendor = parse(`curl -H 'Content-Type: application/vnd.api+json' -d '{}' https://a.test`).request;
    expect(vendor.headers).toEqual([enabled('Content-Type', 'application/vnd.api+json')]);
  });

  it('infers JSON from the body when no content type is given', () => {
    expect(parse(`curl -d '{"a":[1,2]}' https://a.test`).request.body.type).toBe('json');
    expect(parse(`curl -d '{not json' https://a.test`).request.body.type).toBe('text');
  });

  it('parses urlencoded data into form rows, decoding values and joining repeated -d', () => {
    const { request } = parse(`curl -d 'a=b%20c+d' --data 'e=f' --data-ascii g=h https://a.test`);
    expect(request.body).toEqual({
      type: 'form',
      text: '',
      form: [enabled('a', 'b c d'), enabled('e', 'f'), enabled('g', 'h')],
    });
    expect(request.headers).toEqual([]);
  });

  it('treats explicit form content type with parsable data as a form', () => {
    const { request } = parse(`curl -H 'Content-Type: application/x-www-form-urlencoded' -d 'a=1' https://a.test`);
    expect(request.body.type).toBe('form');
    expect(request.headers).toEqual([]);
  });

  it('keeps plain text bodies as text and preserves curl default content type', () => {
    const { request } = parse(`curl -d 'hello world' https://a.test`);
    expect(request.body).toEqual({ type: 'text', text: 'hello world', form: [] });
    expect(request.headers).toEqual([enabled('Content-Type', 'application/x-www-form-urlencoded')]);
  });

  it('keeps text bodies with an explicit custom content type', () => {
    const { request } = parse(`curl -H 'Content-Type: text/plain' -d 'a=1' https://a.test`);
    expect(request.body).toEqual({ type: 'text', text: 'a=1', form: [] });
    expect(request.headers).toEqual([enabled('Content-Type', 'text/plain')]);
  });

  it('does not interpret @ in --data-raw but warns for file references elsewhere', () => {
    expect(parse(`curl --data-raw '@literal' https://a.test`).request.body.text).toBe('@literal');
    const fromFile = parse('curl -d @payload.json https://a.test');
    expect(fromFile.request.body.type).toBe('none');
    expect(fromFile.warnings[0]).toContain('@payload.json');
  });

  it('encodes --data-urlencode values', () => {
    const { request } = parse(`curl --data-urlencode 'q=a b&c' --data-urlencode '=raw value' https://a.test`);
    expect(request.body.form).toEqual([enabled('q', 'a b&c'), enabled('raw value', '')]);
  });

  it('supports --json with default headers and POST', () => {
    const { request } = parse(`curl --json '{"a":1}' https://a.test`);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({ type: 'json', text: '{"a":1}', form: [] });
    expect(request.headers).toEqual([enabled('Accept', 'application/json')]);
  });

  it('concatenates multiple --json parts', () => {
    expect(parse(`curl --json '{"a":' --json '1}' https://a.test`).request.body.text).toBe('{"a":1}');
  });

  it('moves data to the query string with -G', () => {
    const { request } = parse(`curl -G -d 'a=1' -d 'b=2' https://a.test/x`);
    expect(request.method).toBe('GET');
    expect(request.url).toBe('https://a.test/x?a=1&b=2');
    expect(request.body.type).toBe('none');
    expect(parse(`curl -G -d 'b=2' 'https://a.test/x?a=1#frag'`).request.url).toBe('https://a.test/x?a=1&b=2#frag');
  });

  it('warns that a body is dropped for GET requests', () => {
    const { warnings } = parse(`curl -X GET -d 'a=1' https://a.test`);
    expect(warnings.some((warning) => warning.includes('GET'))).toBe(true);
  });

  it('imports -F and --form-string fields as a multipart body', () => {
    const { request, warnings } = parse(`curl -F 'file=@a.png;type=image/png' -F name=x --form-string 'y=@z' https://a.test`);
    expect(request.method).toBe('POST');
    expect(request.body.type).toBe('multipart');
    expect(request.body.multipart).toEqual([
      { key: 'file', kind: 'file', value: 'a.png', enabled: true },
      { key: 'name', kind: 'text', value: 'x', enabled: true },
      { key: 'y', kind: 'text', value: '@z', enabled: true },
    ]);
    expect(warnings).toEqual([]);
  });

  it('drops a hand-written multipart Content-Type header and warns on unsupported form fields', () => {
    const { request, warnings } = parse(`curl -H 'Content-Type: multipart/form-data' -F 'a=<f.txt' -F ok=1 -F broken https://a.test`);
    expect(request.headers).toEqual([]);
    expect(warnings).toHaveLength(2);
  });

  it('imports --data-binary @file as a binary body', () => {
    const { request, warnings } = parse(`curl --data-binary @payload.bin -H 'Content-Type: application/zip' https://a.test`);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({ type: 'binary', text: '', form: [], filePath: 'payload.bin' });
    expect(request.headers).toEqual([enabled('Content-Type', 'application/zip')]);
    expect(warnings).toEqual([]);
  });

  it('keeps inline --data-binary text as a body', () => {
    expect(parse(`curl --data-binary 'raw' https://a.test`).request.body.text).toBe('raw');
  });

  it('detects GraphQL JSON bodies', () => {
    const payload = JSON.stringify({ query: '{ me { id } }', variables: { id: 1 } });
    const { request } = parse(`curl -H 'Content-Type: application/json' -d '${payload}' https://a.test/graphql`);
    expect(request.body).toEqual({ type: 'graphql', text: '{ me { id } }', form: [], graphqlVariables: JSON.stringify({ id: 1 }, null, 2) });
    expect(request.headers).toEqual([]);
  });

  it('keeps JSON with extra keys or non-string queries as json', () => {
    expect(parse(`curl -d '{"query":"x","extensions":{}}' https://a.test`).request.body.type).toBe('json');
    expect(parse(`curl -d '{"query":"x","operationName":5}' https://a.test`).request.body.type).toBe('json');
    expect(parse(`curl -d '{"query":1}' https://a.test`).request.body.type).toBe('json');
  });
});

describe('parseCurlCommand quoting and line continuation', () => {
  it('parses multi-line commands from browsers', () => {
    const command = [
      "curl 'https://a.test/api' \\",
      "  -H 'accept: */*' \\",
      "  -H 'content-type: application/json' \\",
      `  --data-raw '{"name":"it'\\''s"}' \\`,
      '  --compressed',
    ].join('\n');
    const { request } = parse(command);
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual([enabled('accept', '*/*')]);
    expect(request.body.text).toBe(`{"name":"it's"}`);
  });

  it('parses $-quoted bodies with escapes', () => {
    const { request } = parse(`curl -H 'Content-Type: application/json' --data-raw $'{"a":"x\\ny"}' https://a.test`);
    expect(request.body.text).toBe('{"a":"x\ny"}');
  });

  it('parses double-quoted bodies with escaped quotes and variables untouched', () => {
    const { request } = parse(`curl -d "{\\"id\\": \\"{{id}}\\"}" "{{base}}/items"`);
    expect(request.body.text).toBe('{"id": "{{id}}"}');
    expect(request.url).toBe('{{base}}/items');
  });

  it('keeps ampersands of unquoted urls', () => {
    expect(parse('curl https://a.test/x?a=1&b=2').request.url).toBe('https://a.test/x?a=1&b=2');
  });
});

describe('generateCurlCommand', () => {
  it('omits -X for GET and quotes the url', () => {
    expect(generateCurlCommand({ url: 'https://a.test/x?a=1&b=2', method: 'GET', headers: {} })).toBe("curl 'https://a.test/x?a=1&b=2'");
  });

  it('includes method, headers and body', () => {
    const command = generateCurlCommand({
      url: 'https://a.test',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-A': 'b' },
      body: '{"a":1}',
    });
    expect(command).toBe(`curl -X POST 'https://a.test' -H 'Content-Type: application/json' -H 'X-A: b' --data-raw '{"a":1}'`);
  });

  it('uses --head for HEAD requests', () => {
    expect(generateCurlCommand({ url: 'u', method: 'HEAD', headers: {} })).toBe("curl --head 'u'");
  });

  it('escapes single quotes and keeps newlines inside quotes', () => {
    const command = generateCurlCommand({ url: 'u', method: 'POST', headers: {}, body: "it's\nok" });
    expect(command).toBe(`curl -X POST 'u' --data-raw 'it'\\''s\nok'`);
  });

  it('substitutes variables when built from a prepared request', () => {
    const request = { ...createRequest('r'), method: 'POST' as const, url: '{{base}}/x', body: { type: 'json' as const, text: '{"k":"{{v}}"}', form: [] } };
    const command = generateCurlCommand(prepareRequest(request, { base: 'https://h', v: '1' }));
    expect(command).toContain("'https://h/x'");
    expect(command).toContain(`--data-raw '{"k":"1"}'`);
  });
});

describe('round trip', () => {
  it('re-parsing a generated command reproduces the request', () => {
    const original = {
      ...createRequest('r'),
      method: 'PUT' as const,
      url: 'https://a.test/x?y=1',
      headers: [enabled('X-A', "it's")],
      body: { type: 'json' as const, text: '{"a":"b c"}', form: [] },
    };
    const command = generateCurlCommand(prepareRequest(original, {}));
    const { request } = parse(command);
    expect(request).toMatchObject({ method: 'PUT', url: 'https://a.test/x?y=1', body: { type: 'json', text: '{"a":"b c"}' } });
    expect(request.headers).toEqual([enabled('X-A', "it's")]);
  });
});

describe('generateCurlCommand body types', () => {
  it('emits form flags for multipart and --data-binary for files', () => {
    const base = { url: 'http://h/u', method: 'POST', headers: {} };
    const multipart = [
      { kind: 'text' as const, name: 'a', value: '@x' },
      { kind: 'file' as const, name: 'f', filePath: '/p/q.png' },
    ];
    expect(generateCurlCommand({ ...base, multipart })).toBe(
      `curl -X POST 'http://h/u' --form-string 'a=@x' -F 'f=@/p/q.png'`,
    );
    expect(generateCurlCommand({ ...base, bodyFilePath: '/p/q.bin' })).toBe(`curl -X POST 'http://h/u' --data-binary '@/p/q.bin'`);
  });
});

describe('generateCurlCommand authentication', () => {
  const base = { url: 'http://h/u', method: 'GET', headers: {} };

  it('emits --digest with credentials', () => {
    expect(generateCurlCommand({ ...base, digest: { username: 'u', password: "p'w" } })).toBe(
      `curl 'http://h/u' --digest -u 'u:p'\\''w'`,
    );
  });

  it('warns only when an OAuth 2.0 token is missing', () => {
    const oauth = { type: 'oauth2' as const, grant: 'client_credentials' as const, tokenUrl: '', clientId: '', clientSecret: '', scope: '', username: '', password: '' };
    expect(curlGenerationWarnings(oauth, base)).toHaveLength(1);
    expect(curlGenerationWarnings(oauth, { ...base, headers: { authorization: 'Bearer t' } })).toEqual([]);
    expect(curlGenerationWarnings({ type: 'none' }, base)).toEqual([]);
  });
});

describe('GraphQL cURL imports', () => {
  const COUNTRIES_QUERY = '{ country(code:"BE"){ name capital } }';
  const commands: Record<string, string> = {
    'single-quoted body with escaped double quotes': `curl -X POST https://countries.trevorblades.com/ -H 'Content-Type: application/json' -d '{"query":"{ country(code:\\"BE\\"){ name capital } }"}'`,
    '--data-raw with backslash line continuations': `curl https://countries.trevorblades.com/ \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"query":"{ country(code:\\"BE\\"){ name capital } }"}'`,
  };

  it.each(Object.entries(commands))('turns %s into a graphql POST', (_label, command) => {
    const { request } = parse(command);
    expect(request).toMatchObject({ kind: 'graphql', method: 'POST', headers: [], body: { type: 'graphql', text: COUNTRIES_QUERY } });
  });

  it('keeps variables and operationName', () => {
    const payload = JSON.stringify({ query: 'query Q($c: ID!) { country(code:$c){ name } }', variables: { c: 'BE' }, operationName: 'Q' });
    const { request } = parse(`curl https://a.test/graphql -H "Content-Type: application/json" --data-raw '${payload}'`);
    expect(request.body).toMatchObject({ type: 'graphql', graphqlVariables: JSON.stringify({ c: 'BE' }, null, 2), graphqlOperationName: 'Q' });
  });

  it('survives serialization and loading with its kind and body intact', () => {
    const payload = JSON.stringify({ query: COUNTRIES_QUERY, variables: { c: 'BE' }, operationName: 'Q' });
    const { request } = parse(`curl https://a.test/graphql -H "Content-Type: application/json" -d '${payload}'`);
    const collection = createCollection('Imported', () => 'c1');
    collection.items.push(request);
    const loaded = parseOwnCollection(JSON.parse(serializeCollection(collection)), (id) => String(id));
    expect(loaded.items[0]).toEqual(request);
  });
});
