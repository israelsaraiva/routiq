import { buildSchema, introspectionFromSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { createIntrospectionRequest, parseIntrospectionResponse, summarizeSchema } from './introspection';
import { applySuggestion, suggestGraphql } from './completion';
import { extractGraphqlErrors } from './errors';
import { insertField } from './insertField';
import { listOperations, resolveOperationName } from './operations';
import { validateVariables } from './variablesValidation';
import { parseCurlCommand } from '../curl';
import { prettifyQuery, prettifyVariables } from './prettify';
import { operationKeywordFor, searchSchema } from './schemaSearch';
import { tokenizeGraphql } from './tokens';
import { createRequest } from '../factories';
import { prepareRequest } from '../requestBuilder';
import { requestKindOf } from '../requestKinds';

const SDL = `
  """A person"""
  type User { id: ID! name(format: String = "short"): String @deprecated(reason: "x") friends: [User!]! role: Role }
  enum Role { ADMIN GUEST }
  union Result = User | Team
  type Team { title: String }
  type Query { me: User users(limit: Int): [User!]! result: Result }
  type Mutation { rename(name: String!): User }
`;

const schema = summarizeSchema(introspectionFromSchema(buildSchema(SDL)));

function complete(text: string) {
  const caret = text.indexOf('|');
  const document = text.replace('|', '');
  return suggestGraphql(document, caret, schema).items.map((item) => item.label);
}

describe('graphql tokenizer', () => {
  it('classifies tokens and keeps the text lossless', () => {
    const source = 'query Q($id: ID = 1) { # c\n me(name: "a\\"b") @skip(if: true) { ...F } }';
    const tokens = tokenizeGraphql(source);
    expect(tokens.map((token) => token.text).join('')).toBe(source);
    const kinds = Object.fromEntries(tokens.map((token) => [token.text, token.kind]));
    expect(kinds).toMatchObject({ query: 'keyword', Q: 'name', $id: 'variable', '1': 'number', '# c': 'comment', '"a\\"b"': 'string', '@skip': 'directive', '...': 'punctuation' });
  });

  it('tolerates unterminated strings', () => {
    expect(tokenizeGraphql('{ a(b: "oops').map((token) => token.kind)).toContain('string');
  });
});

describe('graphql operations', () => {
  it('lists anonymous, named and shorthand operations but not fragments', () => {
    const document = 'query A { a } mutation B($x: Int) { b } fragment F on User { id } subscription { c } { d }';
    expect(listOperations(document)).toEqual([
      { type: 'query', name: 'A' },
      { type: 'mutation', name: 'B' },
      { type: 'subscription' },
      { type: 'query' },
    ]);
  });

  it('does not count nested braces or argument objects as operations', () => {
    expect(listOperations('query A { a(f: {x: 1}) { b } }')).toHaveLength(1);
  });

  it('resolves the operation name only when it is needed', () => {
    const multiple = 'query A { a } query B { b }';
    expect(resolveOperationName('query A { a }', undefined)).toBeUndefined();
    expect(resolveOperationName(multiple, 'B')).toBe('B');
    expect(resolveOperationName(multiple, 'gone')).toBe('A');
  });
});

describe('graphql prettify', () => {
  it('formats valid documents and reports syntax errors', () => {
    expect(prettifyQuery('{me{id}}')).toEqual({ ok: true, text: '{\n  me {\n    id\n  }\n}' });
    expect(prettifyQuery('{ me ').ok).toBe(false);
    expect(prettifyVariables('{"a":1}')).toEqual({ ok: true, text: '{\n  "a": 1\n}' });
    expect(prettifyVariables('{a').ok).toBe(false);
  });
});

describe('graphql variables validation', () => {
  it('accepts empty text and objects only', () => {
    expect(validateVariables('')).toEqual({ valid: true });
    expect(validateVariables('{"a":1}')).toEqual({ valid: true });
    expect(validateVariables('[1]')).toMatchObject({ valid: false });
    expect(validateVariables('{a')).toMatchObject({ valid: false });
  });
});

describe('graphql introspection', () => {
  it('summarizes types, fields, args, enums and unions', () => {
    expect(schema.queryType).toBe('Query');
    expect(schema.mutationType).toBe('Mutation');
    const user = schema.types.find((type) => type.name === 'User');
    expect(user?.description).toBe('A person');
    expect(user?.fields.find((field) => field.name === 'friends')).toMatchObject({ type: '[User!]!', namedType: 'User' });
    expect(user?.fields.find((field) => field.name === 'name')).toMatchObject({ deprecated: true, args: [{ name: 'format', type: 'String', defaultValue: '"short"' }] });
    expect(schema.types.find((type) => type.name === 'Role')?.members).toEqual(['ADMIN', 'GUEST']);
    expect(schema.types.find((type) => type.name === 'Result')?.members).toEqual(['User', 'Team']);
    expect(schema.types.some((type) => type.name.startsWith('__'))).toBe(false);
  });

  it('parses introspection responses and explains failures', () => {
    const body = JSON.stringify({ data: introspectionFromSchema(buildSchema(SDL)) });
    expect(parseIntrospectionResponse(body)).toMatchObject({ ok: true });
    expect(parseIntrospectionResponse('<html>')).toMatchObject({ ok: false });
    expect(parseIntrospectionResponse('{"errors":[{"message":"disabled"}]}')).toMatchObject({ ok: false });
  });

  it('builds a script-free POST introspection request that keeps url, headers and auth', () => {
    const base = {
      ...createRequest('G', () => 'g', 'graphql'),
      url: '{{host}}/graphql',
      headers: [{ key: 'X-A', value: '1', enabled: true }],
      auth: { type: 'bearer' as const, token: 't' },
      scripts: { pre: 'x', post: 'y' },
    };
    const introspection = createIntrospectionRequest(base);
    expect(introspection.scripts).toBeUndefined();
    const prepared = prepareRequest(introspection, { host: 'https://h.io' });
    expect(prepared.url).toBe('https://h.io/graphql');
    expect(prepared.headers['X-A']).toBe('1');
    expect(prepared.headers.Authorization).toBeDefined();
    expect(JSON.parse(prepared.body ?? '').query).toContain('__schema');
  });
});

describe('graphql completion', () => {
  it('suggests root fields inside the operation selection', () => {
    expect(complete('query { | }')).toEqual(['me', 'users', 'result', '__typename']);
    expect(complete('{ us| }')).toEqual(['users']);
    expect(complete('mutation { | }')).toContain('rename');
  });

  it('follows field types through nested selections, aliases and arguments', () => {
    expect(complete('{ me { friends(limit: 2) { | } } }')).toEqual(['id', 'name', 'friends', 'role', '__typename']);
    expect(complete('{ boss: me { na| } }')).toEqual(['name']);
  });

  it('suggests type names after on and fields of the fragment type', () => {
    expect(complete('{ result { ... on | } }')).toEqual(expect.arrayContaining(['User', 'Team', 'Result']));
    expect(complete('{ result { ... on Team { | } } }')).toEqual(['title', '__typename']);
    expect(complete('fragment F on Team { | }')).toEqual(['title', '__typename']);
  });

  it('suggests keywords at top level and nothing inside arguments', () => {
    expect(complete('| ')).toEqual(['query', 'mutation', 'subscription', 'fragment']);
    expect(complete('{ users(| ) }')).toEqual([]);
  });

  it('applies a suggestion over the typed prefix', () => {
    const suggestions = suggestGraphql('{ us }', 4, schema);
    expect(applySuggestion('{ us }', 4, suggestions, 'users')).toEqual({ text: '{ users }', caret: 7 });
  });
});

describe('graphql schema explorer helpers', () => {
  it('searches types, fields and arguments', () => {
    expect(searchSchema(schema, 'limit').map((result) => result.type.name)).toEqual(['Query']);
    expect(searchSchema(schema, 'person')[0].fields.length).toBeGreaterThan(0);
    expect(searchSchema(schema, '').length).toBe(schema.types.length);
    expect(searchSchema(schema, 'nomatch')).toEqual([]);
  });

  it('picks the operation keyword for root types', () => {
    expect(operationKeywordFor(schema, 'Mutation')).toBe('mutation');
    expect(operationKeywordFor(schema, 'User')).toBe('query');
  });

  it('inserts a field into an empty query, a blank line and after other text', () => {
    expect(insertField('', 0, 'me', 'query')).toEqual({ text: 'query {\n  me\n}', caret: 12 });
    expect(insertField('{\n  \n}', 4, 'me', 'query').text).toBe('{\n  me\n}');
    expect(insertField('{\n  a\n}', 5, 'b', 'query').text).toBe('{\n  a\n    b\n}');
  });
});

describe('graphql errors', () => {
  it('extracts errors with path, locations and code', () => {
    const body = JSON.stringify({ data: null, errors: [{ message: 'bad', path: ['a', 0, 'b'], locations: [{ line: 1, column: 2 }], extensions: { code: 'X' } }, 'plain'] });
    expect(extractGraphqlErrors(body)).toEqual([
      { message: 'bad', path: 'a.0.b', locations: [{ line: 1, column: 2 }], code: 'X' },
      { message: 'plain', locations: [] },
    ]);
    expect(extractGraphqlErrors('{"data":{}}')).toEqual([]);
    expect(extractGraphqlErrors('nope')).toEqual([]);
  });
});

describe('graphql requests', () => {
  it('maps imported graphql bodies to the graphql kind', () => {
    const { request } = parseCurlCommand(`curl -X POST -d '{"query":"{ a }"}' -H 'Content-Type: application/json' https://a.test/graphql`);
    expect(request).toMatchObject({ kind: 'graphql', method: 'POST', body: { type: 'graphql', text: '{ a }' } });
  });

  it('creates POST graphql-kind requests', () => {
    const request = createRequest('G', () => 'g', 'graphql');
    expect(request).toMatchObject({ kind: 'graphql', method: 'POST', body: { type: 'graphql' } });
  });

  it('treats legacy POST graphql-body requests as graphql and sends the operation name', () => {
    const legacy = { ...createRequest('L', () => 'l'), method: 'POST' as const, body: { type: 'graphql' as const, text: 'query A { a } query B { b }', form: [], graphqlOperationName: 'B' } };
    expect(requestKindOf(legacy)).toBe('graphql');
    expect(requestKindOf({ ...legacy, method: 'PUT' })).toBe('http');
    expect(JSON.parse(prepareRequest(legacy, {}).body ?? '')).toMatchObject({ operationName: 'B' });
  });
});
