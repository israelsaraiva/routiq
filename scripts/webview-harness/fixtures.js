const emptyBody = { type: 'none', text: '', form: [] };

const emptyRequest = {
  id: 'r1', name: 'New request', method: 'GET', url: '',
  params: [], headers: [], body: emptyBody, auth: { type: 'none' },
};

const filledRequest = {
  id: 'r2', name: 'Create a user with a rather long request name that should truncate', method: 'POST',
  url: 'https://api.example.com/v1/users/{{userId}}/projects?include=members&sort=-createdAt',
  params: [
    { key: 'include', value: 'members', enabled: true },
    { key: 'sort', value: '-createdAt', enabled: true },
    { key: 'debug', value: 'true', enabled: false },
    { key: '', value: '', enabled: true },
  ],
  headers: [
    { key: 'Content-Type', value: 'application/json', enabled: true },
    { key: 'Authorization', value: 'Bearer {{token}}', enabled: true, secret: true },
    { key: 'X-Very-Long-Header-Name-For-Overflow-Testing', value: 'a-very-long-value-'.repeat(8), enabled: true },
  ],
  body: { type: 'json', text: '{\n  "name": "Ada Lovelace",\n  "email": "ada@example.com",\n  "roles": ["admin", "editor"]\n}', form: [] },
  auth: { type: 'bearer', token: '{{token}}' },
  scripts: { pre: 'rq.variables.set("now", Date.now());', post: 'rq.test("status is 201", () => rq.expect(rq.response.status).toBe(201));' },
};

const sseRequest = { ...emptyRequest, id: 'r3', name: 'Events', kind: 'sse', stream: true, url: 'https://api.example.com/events' };
const wsRequest = { ...emptyRequest, id: 'r4', name: 'Socket', kind: 'websocket', stream: true, url: 'wss://echo.example.com/ws', subprotocols: 'chat', autoReconnect: true };
const grpcRequest = {
  ...emptyRequest, id: 'r5', name: 'SayHello', kind: 'grpc', stream: true, url: 'localhost:50051',
  grpc: { tls: false, protoFiles: ['/Users/dev/protos/greeter/helloworld.proto'], importPaths: ['/Users/dev/protos'], service: 'helloworld.Greeter', method: 'SayHello' },
  body: { type: 'json', text: '{"name": "world"}', form: [] },
};
const graphqlRequest = {
  ...emptyRequest, id: 'r6', name: 'Countries', kind: 'graphql', method: 'POST', url: 'https://countries.example.com/graphql',
  body: { type: 'graphql', text: 'query Countries($code: ID!) {\n  country(code: $code) {\n    name\n    capital\n  }\n}', form: [], graphqlVariables: '{"code": "BE"}' },
};

const jsonBody = JSON.stringify({
  id: 42, name: 'Ada Lovelace', active: true, score: 99.5, nothing: null,
  tags: ['admin', 'editor'], address: { city: 'London', zip: 'N1 9GU' },
  longText: 'lorem ipsum dolor sit amet '.repeat(12),
}, null, 2);

const response = (status, statusText, body, extra = {}) => ({
  status, statusText, timeMs: 184, sizeBytes: body.length,
  headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ['x-request-id', 'f3a1c9e0-77b1-4f0d-9b36-aaaaaaaaaaaa']],
  body, timing: { waitMs: 150, downloadMs: 34, redirects: 0 }, ...extra,
});

const scriptsOutcome = {
  tests: [{ name: 'status is 201', passed: true }, { name: 'has id', passed: false, message: 'expected undefined to be defined' }],
  console: [{ level: 'log', text: 'hello' }, { level: 'warn', text: 'careful' }, { level: 'error', text: 'boom' }],
  errors: ['post-response: ReferenceError: foo is not defined'],
};

const schema = {
  queryType: 'Query', mutationType: 'Mutation',
  types: [
    { name: 'Query', kind: 'object', members: [], fields: [
      { name: 'country', type: 'Country', namedType: 'Country', description: 'Look up a country by code', args: [{ name: 'code', type: 'ID!', description: 'ISO code' }] },
      { name: 'countries', type: '[Country!]!', namedType: 'Country', args: [], deprecated: true },
    ] },
    { name: 'Mutation', kind: 'object', members: [], fields: [{ name: 'rename', type: 'Country', namedType: 'Country', args: [{ name: 'name', type: 'String!' }] }] },
    { name: 'Country', kind: 'object', members: [], description: 'A country', fields: [
      { name: 'name', type: 'String!', namedType: 'String', args: [] },
      { name: 'capital', type: 'String', namedType: 'String', args: [] },
    ] },
    { name: 'Continent', kind: 'enum', members: ['EU', 'AS', 'AF'], fields: [] },
    { name: 'String', kind: 'scalar', members: [], fields: [] },
  ],
};

const history = [
  { id: 'h1', timestamp: Date.now() - 60000, method: 'POST', status: 201, statusText: 'Created', durationMs: 184 },
  { id: 'h2', timestamp: Date.now() - 3600000, method: 'POST', status: 404, statusText: 'Not Found', durationMs: 92 },
  { id: 'h3', timestamp: Date.now() - 86400000, method: 'POST', status: 500, statusText: 'Internal Server Error', durationMs: 1200 },
  { id: 'h4', timestamp: Date.now() - 172800000, method: 'POST', status: 0, statusText: '', durationMs: 5000, error: 'connect ECONNREFUSED 127.0.0.1:3000' },
];

const environmentsDraft = {
  variables: [{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }, { key: 'userId', value: '42', enabled: true }],
  activeEnvironmentId: 'e1',
  environments: [
    { id: 'e1', name: 'Production', variables: [{ key: 'token', value: 'secret-token', enabled: true, secret: true }, { key: 'host', value: 'prod.example.com', enabled: true }] },
    { id: 'e2', name: 'Staging', variables: [] },
  ],
};

const environmentState = {
  type: 'environmentState',
  environments: [{ id: 'e1', name: 'Production' }, { id: 'e2', name: 'Staging' }],
  activeEnvironmentId: 'e1',
};

const variableSuggestions = {
  type: 'variableSuggestions',
  variables: [
    { name: 'baseUrl', source: 'base' }, { name: 'token', source: 'environment' }, { name: 'userId', source: 'base' },
    { name: '$uuid', source: 'dynamic' }, { name: '$timestamp', source: 'dynamic' },
  ],
};

module.exports = {
  emptyRequest, filledRequest, sseRequest, wsRequest, grpcRequest, graphqlRequest, jsonBody, response, scriptsOutcome,
  schema, history, environmentsDraft, environmentState, variableSuggestions,
};
