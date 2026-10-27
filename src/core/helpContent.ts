export interface HelpItem {
  id: string;
  title: string;
  body: string[];
  code?: string;
  keywords?: string[];
}

export interface ShortcutEntry {
  keys: string;
  action: string;
  where: string;
}

export interface HelpSection {
  id: string;
  title: string;
  summary: string;
  items: HelpItem[];
  shortcuts?: ShortcutEntry[];
  hasSettingsButton?: boolean;
}

const GETTING_STARTED: HelpSection = {
  id: 'getting-started',
  title: 'Getting started',
  summary: 'Create a collection, add a request and send it.',
  items: [
    {
      id: 'create-collection',
      title: 'Create a collection',
      body: [
        'Open the Routiq view in the activity bar and click New Collection (or run "Routiq: New Collection").',
        'A collection holds requests and nested folders. Right-click it for New Request, New Folder, Import, Run and Export.',
      ],
    },
    {
      id: 'create-request',
      title: 'Add a request',
      body: [
        'Right-click a collection or folder and choose New Request. Pick the kind: HTTP, GraphQL, Server-Sent Events, WebSocket or gRPC, then give it a name.',
        'Click a request in the tree to open its editor. Drag and drop in the tree to move or reorder requests and folders.',
        'Right-click a collection or folder → Sort for A→Z, Z→A or by method (recursive variants too); the order is saved. Use Move to… to move items without dragging, drop a collection on another collection or folder to nest it as a folder, and Promote Folder to Collection to reverse it.',
      ],
    },
    {
      id: 'send-request',
      title: 'Send a request',
      body: [
        'Choose the method, type the URL and press Enter in the URL field or click Send. The response shows status, time, size, headers and a pretty-printed body.',
        'Save (Cmd/Ctrl+S) persists the request to the collection file. Auto save does it for you 5 seconds after your last edit (routiq.autoSave, routiq.autoSaveDelayMs); blank requests and invalid JSON bodies are left for a manual save.',
      ],
    },
    {
      id: 'find-requests',
      title: 'Search and filter requests',
      body: [
        'Search Requests (magnifier in the view title) opens a quick pick over every request by name, method, URL and path.',
        'Filter Requests in Tree fuzzy-filters the tree; Clear Tree Filter removes the filter.',
      ],
    },
  ],
};

const REQUESTS_AND_TABS: HelpSection = {
  id: 'requests-and-tabs',
  title: 'Requests & tabs',
  summary: 'Params, headers, body types and authentication.',
  items: [
    {
      id: 'params-headers',
      title: 'Params and headers',
      body: [
        'Params and Headers are key/value tables with an enable checkbox per row. Query params stay in sync with the URL. Tab badges show how many rows are active.',
        'Typing {{ in a value opens variable autocomplete; the headers table also suggests common header names.',
      ],
      keywords: ['query', 'enable', 'disable'],
    },
    {
      id: 'body-types',
      title: 'Body types',
      body: [
        'Available body types: none, JSON, XML, text, form (x-www-form-urlencoded), multipart form (text and file fields), binary file and GraphQL.',
        'JSON, XML and text bodies have a Prettify button (Shift+Alt+F in the editor); JSON also has Minify and a live Valid/Invalid indicator. {{variables}} stay intact, even unquoted.',
      ],
      keywords: ['prettify', 'format', 'minify', 'multipart', 'binary', 'urlencoded'],
    },
    {
      id: 'auth-types',
      title: 'Authentication types',
      body: [
        'None, Bearer token, Basic Auth, API Key (header or query param), OAuth 2.0 (authorization code with optional PKCE, client credentials or password grant), Digest Auth and AWS Signature v4.',
        'OAuth 2.0 tokens are fetched by the extension and refreshed on send; use Fetch token in the Auth tab to force a refresh. Digest auth is applied after a 401 challenge. The authorization code grant opens your browser and listens on a local loopback redirect (a free port, or the http://localhost:PORT/path you set); its token and refresh token are kept in VS Code secret storage. AWS Signature v4 signs each request (and each redirect hop) with the access key, secret, optional session token, region and service.',
        'Credentials entered in the Auth tab are stored in the collection file as plain text; use secret variables such as {{token}} instead.',
      ],
      keywords: ['bearer', 'basic', 'oauth', 'digest', 'api key', 'token'],
    },
    {
      id: 'response-viewer',
      title: 'Response viewer',
      body: [
        'Syntax-highlighted JSON/XML/HTML, Pretty/Raw and wrap toggles, find in response, a JSON path filter ($.data[0].name), copy and Save body to file.',
        'Each sent request is recorded in the request History (method, URL, status, headers, bodies).',
      ],
      keywords: ['history', 'jsonpath', 'find'],
    },
    {
      id: 'convert-graphql',
      title: 'Convert between HTTP and GraphQL',
      body: [
        'Open the ... menu in the request toolbar and choose Convert to GraphQL (HTTP requests) or Convert to HTTP (GraphQL requests). You can also right-click a request in the tree. A notice offers Undo, and the change is an ordinary edit: save it or leave it unsaved.',
        'A JSON body of the shape {query, variables, operationName} fills the Query tab; a text body is used as the query when it looks like GraphQL. Bodies that cannot be carried over (form, multipart, binary, other JSON) are discarded and a notice says so.',
      ],
      keywords: ['graphql', 'convert', 'http'],
    },
    {
      id: 'copy-as-curl',
      title: 'Copy as cURL',
      body: ['The Copy as cURL button (or the request context menu) substitutes variables, applies auth and copies a ready-to-run command.', 'The syntax follows your OS: PowerShell (curl.exe, backtick continuations) on Windows, bash elsewhere. Override it with the routiq.curlShell setting (auto, bash, powershell, cmd). Pasting Windows cURL (cmd or PowerShell) works too.'],
      keywords: ['curl'],
    },
  ],
};

const VARIABLES_AND_ENVIRONMENTS: HelpSection = {
  id: 'variables-and-environments',
  title: 'Variables',
  summary: 'Define variables, use {{name}} anywhere, and see them highlighted with suggestions.',
  items: [
    {
      id: 'define-variable',
      title: 'Define a variable',
      body: [
        'Open Manage Environments (collection context menu or the gear in a request panel), pick an environment such as dev, add a row and fill Variable and Value. Rows are enabled by default; untick one to ignore it.',
        'Variables on the Base tab apply to every request of the collection; variables of the active environment apply on top. Save with Cmd/Ctrl+S.',
      ],
      code: ['Variable   Value', 'baseUrl    https://api.example.com', 'userId     42', 'email      ana@example.com'].join('\n'),
      keywords: ['define', 'create', 'add', 'baseurl', 'environment', 'manage environments'],
    },
    {
      id: 'use-variables',
      title: 'Use variables in requests',
      body: [
        'Write {{name}} in the URL, params, headers, form and multipart fields, binary file path, auth fields, GraphQL query and variables, and in text, JSON, XML and gRPC message bodies. WebSocket composer messages are sent as typed, without substitution. Spaces inside the braces are allowed: {{ baseUrl }}.',
        'Unknown placeholders are sent untouched, so a typo shows up as a literal {{name}} in the request.',
      ],
      code: [
        'URL           {{baseUrl}}/users/{{userId}}',
        'Header        Authorization: Bearer {{token}}',
        'JSON body     {"email": "{{email}}"}',
        'JSON number   {"id": {{userId}}}',
        'In a string   {"link": "{{baseUrl}}/users/{{userId}}"}',
      ].join('\n'),
      keywords: ['url', 'header', 'authorization', 'bearer', 'json', 'body', 'unquoted', 'string'],
    },
    {
      id: 'graphql-variables',
      title: 'Variables in GraphQL',
      body: [
        'The query text and the Variables JSON are both substituted before sending. Inside the Variables JSON, quote a placeholder to send a string and leave it unquoted to send a number or boolean.',
      ],
      code: ['query ($id: ID!) { user(id: $id) { name } }', '', '{"id": "{{userId}}", "notify": {{notify}}}'].join('\n'),
      keywords: ['graphql', 'query', 'variables'],
    },
    {
      id: 'variable-highlighting',
      title: 'Highlighting and suggestions',
      body: [
        'Every {{name}} you type is coloured: green when the variable exists (environment, collection, dynamic or secret) and orange with a wavy underline when it is unresolved. Hover it to see the resolved value and its scope; secret values are never shown, only dots.',
        'Type {{ to open the suggestion list at the caret. Keep typing to filter by name. Each entry shows the variable name, a preview of its value (masked for secrets) and its scope: environment, collection or dynamic.',
        'Use Up/Down to move, Enter or Tab (or a click) to insert the variable and its closing }}, and Esc to dismiss. The list follows the active environment and updates when you switch environments or edit variables.',
      ],
      keywords: ['highlight', 'colour', 'color', 'unresolved', 'defined', 'suggestion', 'autocomplete', 'hover', 'tooltip', 'popup'],
    },
    {
      id: 'base-vs-environment',
      title: 'Precedence: environment vs base variables',
      body: [
        'Use {{name}} in the URL, params, headers, body and auth. Unknown placeholders are left untouched.',
        'Every collection has base variables and any number of environments (dev, staging, prod…). One environment can be active; its variables override base variables of the same name. Example: base has baseUrl = https://api.example.com and the active environment dev has baseUrl = http://localhost:3000, so {{baseUrl}} resolves to http://localhost:3000 while dev is active and to https://api.example.com when no environment is active.',
        'Manage Environments (collection context menu or the gear in a request panel) edits them. Switch with the Environment dropdown, the status bar item or "Routiq: Switch Environment". The active environment is stored in the collection file.',
      ],
      keywords: ['environment', 'switch', 'base', 'collection', 'override', 'precedence'],
    },
    {
      id: 'secret-variables',
      title: 'Secret variables',
      body: [
        'Click the lock next to a variable in the environment editor to mark it secret. The value is masked and stored in VS Code SecretStorage, never in the collection JSON file.',
        'Secrets are per machine: they are omitted from exports and not shared when you commit or copy the collection file.',
      ],
      keywords: ['secret', 'secretstorage', 'password', 'token'],
    },
    {
      id: 'set-variable-from-script',
      title: 'Set a variable from a script',
      body: [
        'A post-response script can save a value for later requests with rq.variables.set(name, value). It is written to the active environment (or to the collection variables when none is active), creating the variable if needed, and never overwrites a secret. Later requests and collection runs then resolve {{token}}.',
      ],
      code: ["rq.variables.set('token', rq.response.json().token);"].join('\n'),
      keywords: ['script', 'post-response', 'rq.variables.set', 'token', 'save'],
    },
    {
      id: 'dynamic-variables',
      title: 'Dynamic variables',
      body: ['Generated on every send. Type {{$ in a field to see them; they count as defined, so they are coloured green.'],
      code: [
        '{{$uuid}} / {{$guid}}   random UUID',
        '{{$timestamp}}         Unix time in seconds',
        '{{$timestampMs}}       Unix time in milliseconds',
        '{{$isoTimestamp}}      ISO 8601 date-time',
        '{{$randomInt}}         integer from 0 to 999',
        '{{$randomString}}      16 random letters and digits',
        '{{$randomHex}}         16 random hex digits',
        '{{$randomBoolean}}     true or false',
      ].join('\n'),
      keywords: ['uuid', 'guid', 'timestamp', 'random', 'dynamic', '$'],
    },
  ],
};

const IMPORT_EXPORT: HelpSection = {
  id: 'import-export',
  title: 'Importing & exporting',
  summary: 'Bring requests in from files, the clipboard, cURL, Postman, Insomnia and OpenAPI.',
  items: [
    {
      id: 'import-file',
      title: 'Import from a file',
      body: [
        'Import (toolbar button, collection/folder context menu or "Routiq: Import…") offers From file…, From clipboard and cURL command….',
        'Files go through the same format detection as the clipboard. IDs are regenerated on import and a summary shows counts and warnings.',
      ],
    },
    {
      id: 'import-clipboard',
      title: 'Import from the clipboard (auto-detect)',
      body: [
        '"Routiq: Import from Clipboard" reads the clipboard and detects a cURL command, a Routiq export, a Postman collection or environment, an OpenAPI 3.x / Swagger 2.0 document (JSON or YAML) or an Insomnia v4 export.',
      ],
      keywords: ['clipboard', 'detect', 'paste'],
    },
    {
      id: 'import-curl',
      title: 'cURL paste into the URL bar',
      body: [
        'Paste a command starting with curl into the URL field of an HTTP or GraphQL request. Its method, URL, params, headers, body and auth replace the current ones and a notice offers Undo.',
        'Import cURL (command palette or context menu) creates a new request from a command instead.',
      ],
      code: "curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{\"name\":\"Ada\"}'",
      keywords: ['curl'],
    },
    {
      id: 'import-foreign',
      title: 'Postman, Insomnia and OpenAPI',
      body: [
        'Postman v2.1 collections and environments keep folders, bodies, auth and variables; scripts are translated best-effort to the rq API and untranslatable lines are kept as comments with warnings.',
        'OpenAPI / Swagger documents become one folder per tag with {{baseUrl}} URLs, example bodies and auth mapped from the security schemes (bearer, basic, API key, OAuth 2.0; OpenID Connect is skipped with a warning). Secrets become {{variables}}.',
        'Insomnia v4 exports map workspaces to collections, request groups to folders and environments to environments; authentication (including AWS IAM and OAuth 2.0 with PKCE) is inherited from folders and workspaces, and unsupported types such as Hawk, NTLM or OAuth 1.0 are reported as warnings.',
      ],
      keywords: ['postman', 'insomnia', 'openapi', 'swagger', 'yaml'],
    },
    {
      id: 'export',
      title: 'Exporting',
      body: [
        'Export (toolbar for all collections, or a collection context menu for one) writes a Routiq .json file.',
        'Export as Postman v2.1… writes the collection and one .postman_environment.json per environment; secret values are blanked.',
      ],
      keywords: ['postman', 'json'],
    },
  ],
};

const SCRIPTS_AND_TESTS: HelpSection = {
  id: 'scripts-and-tests',
  title: 'Scripts & tests',
  summary: 'Pre-request and post-response JavaScript with the rq API.',
  items: [
    {
      id: 'rq-api',
      title: 'rq API reference',
      body: [
        'rq.variables.get(name) / rq.variables.set(name, value): string values. Writes go to the active environment (or the collection variables) and are never applied to secrets.',
        'rq.request: url, method, headers (object) and body (text). Pre-request edits apply to that send only.',
        'rq.response (post-response only): status, statusText, timeMs, headers (lower-case names), body, text(), json(), header(name).',
        'rq.test(name, fn) and rq.expect(value) with toBe, toEqual, toContain, toMatch, toHaveLength, toHaveProperty, toBeGreaterThan(OrEqual), toBeLessThan(OrEqual), toBeTruthy, toBeFalsy, toBeNull, toBeUndefined, toBeDefined and .not.',
        'console.log/info/warn/error output is captured in the Tests tab of the response.',
      ],
      keywords: ['rq', 'expect', 'test', 'console', 'assert'],
    },
    {
      id: 'script-examples',
      title: 'Examples',
      body: ['Set a header before sending, then store a token and assert the status afterwards.'],
      code: [
        '// pre-request',
        "rq.variables.set('nonce', String(Date.now()));",
        "rq.request.headers['X-Nonce'] = rq.variables.get('nonce');",
        '',
        '// post-response',
        "rq.variables.set('token', rq.response.json().token);",
        "rq.test('created', () => rq.expect(rq.response.status).toBe(201));",
        "console.log('took', rq.response.timeMs, 'ms');",
      ].join('\n'),
      keywords: ['example', 'token', 'nonce'],
    },
    {
      id: 'script-security',
      title: 'Security and consent',
      body: [
        'The first time a script would run in a collection (including imported Postman collections) a modal asks for consent; scripts stay disabled until you choose Allow Scripts. The decision is remembered per collection.',
        'Scripts never run in an untrusted workspace. They run in an isolated worker with capped memory and a timeout (routiq.scripts.timeoutMs). Only allow scripts from sources you trust.',
      ],
      keywords: ['consent', 'trust', 'sandbox', 'worker', 'timeout'],
    },
  ],
  hasSettingsButton: true,
};

const COLLECTION_RUNNER: HelpSection = {
  id: 'collection-runner',
  title: 'Collection runner',
  summary: 'Run every request of a collection or folder in order.',
  items: [
    {
      id: 'run-collection',
      title: 'Run a collection or folder',
      body: [
        'Right-click a collection or folder and choose Run Collection/Folder. HTTP and GraphQL requests run sequentially in tree order with their scripts, so variables set by one request are available to the next. SSE and WebSocket requests are skipped.',
        'A results tab shows status, time and pass/fail per request and test. Stop aborts the in-flight request and ends the run.',
        'The runner sends the saved version of each request; set routiq.runner.delayMs to wait between requests.',
      ],
      keywords: ['runner', 'delay', 'tests'],
    },
  ],
  hasSettingsButton: true,
};

const GRAPHQL: HelpSection = {
  id: 'graphql',
  title: 'GraphQL',
  summary: 'Query editor, variables and a schema explorer.',
  items: [
    {
      id: 'graphql-editor',
      title: 'Query and variables',
      body: [
        'Choose GraphQL in New Request. The request is sent as a { query, variables, operationName } JSON body with POST.',
        'The Query tab has syntax highlighting, a validated Variables JSON editor, an operation selector for documents with several operations and Prettify.',
      ],
    },
    {
      id: 'graphql-schema',
      title: 'Schema explorer and autocomplete',
      body: [
        'Fetch schema runs the introspection query through the normal send pipeline and caches the result per URL. Search types, fields and arguments and click a field to insert it.',
        'With a schema loaded, suggestions appear while typing; press Ctrl+Space to force them.',
      ],
      keywords: ['introspection', 'autocomplete'],
    },
  ],
};

const STREAMS: HelpSection = {
  id: 'websocket-sse',
  title: 'WebSocket & SSE',
  summary: 'Live connections with a message log.',
  items: [
    {
      id: 'sse',
      title: 'Server-Sent Events',
      body: [
        'Use the Server-Sent Events kind (or tick Stream on an HTTP request). Connect opens a streaming GET and lists events live with name, id, retry and data, plus filter, auto-scroll and clear.',
      ],
      keywords: ['stream', 'event-stream'],
    },
    {
      id: 'websocket',
      title: 'WebSocket',
      body: [
        'http(s):// URLs are mapped to ws(s)://. Set headers and comma-separated subprotocols, then Connect. Send text or JSON from the composer; the log shows direction, time and size.',
        'Binary frames can be shown as Hex or Base64. Auto-reconnect is optional. Proxy settings and the cookie jar apply.',
      ],
      keywords: ['ws', 'subprotocol', 'binary', 'reconnect'],
    },
  ],
  hasSettingsButton: true,
};

const GRPC: HelpSection = {
  id: 'grpc',
  title: 'gRPC',
  summary: 'Call unary and streaming methods from .proto files or server reflection.',
  items: [
    {
      id: 'grpc-setup',
      title: 'Target and schema',
      body: [
        'Choose gRPC in New Request. Enter host:port in the URL field, toggle TLS, then keep Use server reflection on to list the services of the server, or switch it off and add one or more .proto files (and import paths) with the file dialog.',
        'Methods appear in the dropdown with their call type; selecting one fills the Message tab with an example JSON body. Servers that do not expose reflection need a .proto file.',
      ],
      keywords: ['proto', 'reflection', 'tls'],
    },
    {
      id: 'grpc-calls',
      title: 'Metadata and calls',
      body: [
        'Metadata uses key/value rows (-bin keys take base64). The timeout field is the call deadline.',
        'Invoke sends the message for unary and server-streaming calls. For client and bidirectional streaming, send each message and End stream half-closes; Cancel aborts.',
      ],
      keywords: ['metadata', 'streaming', 'invoke'],
    },
  ],
};

const STORAGE_AND_GIT: HelpSection = {
  id: 'storage-and-git',
  title: 'Storage & Git',
  summary: 'Where collections live and how to share them.',
  items: [
    {
      id: 'storage-path',
      title: 'routiq.storagePath',
      body: [
        'Empty (default) uses the extension global storage. Set an absolute path, or a path relative to the first workspace folder such as .routiq, to keep collections in your project.',
        'Changing the setting switches directory immediately.',
      ],
      code: '"routiq.storagePath": ".routiq"',
      keywords: ['storage', 'directory', 'folder', 'path'],
    },
    {
      id: 'file-per-collection',
      title: 'One file per collection',
      body: [
        'Each collection is a pretty-printed JSON file named after the collection, written atomically with stable key order, so diffs are readable and merges are practical.',
        'Commit the files to Git to share collections. External edits (git pull, manual changes) are picked up by a file watcher; invalid JSON files are ignored.',
        'Secret variable values are never in the files, and request history is not shared.',
      ],
      keywords: ['git', 'commit', 'share', 'json', 'watcher'],
    },
  ],
  hasSettingsButton: true,
};

const NETWORK_SETTINGS: HelpSection = {
  id: 'network-settings',
  title: 'Cookies, proxy, SSL & redirects',
  summary: 'Network behaviour of every request.',
  items: [
    {
      id: 'cookies',
      title: 'Cookies',
      body: ['Each collection has a cookie jar that honours Set-Cookie (domain, path, expiry, Secure) and is applied across redirects. "Routiq: Manage Cookies" views, deletes and clears cookies.'],
    },
    {
      id: 'redirects',
      title: 'Redirects',
      body: [
        'routiq.followRedirects (default on) and routiq.maxRedirects (default 10). 301/302 on POST and 303 switch to GET without a body; 307/308 keep method and body. Authorization and Cookie headers are dropped on cross-origin hops.',
      ],
    },
    {
      id: 'proxy-tls',
      title: 'Proxy and SSL',
      body: [
        'routiq.proxy falls back to the VS Code http.proxy setting, then HTTPS_PROXY/HTTP_PROXY; NO_PROXY is honoured.',
        'When routiq.proxy is empty and routiq.useVsCodeNetworking is on (default), requests use VS Code networking, so the system proxy/PAC, http.proxy and system certificates apply. Turn it off to use the built-in HTTP client.',
        'Set routiq.rejectUnauthorized to false to accept self-signed certificates (insecure).',
      ],
      keywords: ['certificate', 'tls', 'self-signed', 'https'],
    },
    {
      id: 'timeout',
      title: 'Timeout',
      body: [
        'routiq.timeoutMs sets the default (30000 ms); override it per request with the timeout field next to Send.',
        'routiq.connectTimeoutMs (default 10000 ms) limits connecting: a connect timeout means the host is unreachable, a response timeout means it was reached but did not answer.',
      ],
    },
  ],
  hasSettingsButton: true,
};

const KAFKA: HelpSection = {
  id: 'kafka',
  title: 'Kafka listener',
  summary: 'Listen to topics, follow message flows and produce test messages.',
  items: [
    {
      id: 'kafka-connect',
      title: 'Connect and listen',
      body: [
        'Open the Kafka view and choose New Connection (or run "Routiq: Open Kafka Listener"). Enter one or more brokers and comma-separated topics, then Connect.',
        'Use Test Kafka fills localhost:9092 and the sample topics. Optional: consumer group, start position (latest, beginning, offsets, timestamp or last N per partition), SSL/TLS and SASL (PLAIN, SCRAM, OAuth bearer, AWS MSK IAM) with presets for Confluent Cloud, MSK IAM, OAuth and mutual TLS. Passwords, tokens and keys are kept in VS Code Secret Storage, never in plain JSON.',
        'If the broker drops, the listener reconnects with backoff and resumes where it stopped; Disconnect stops it. gzip, snappy, lz4 and zstd records are decoded. Large values are truncated with a Show full button (routiq.kafka.maxMessageBytesDisplayed).',
        'Pick a collection under "Variables from collection" to use {{variables}} in brokers, topics and the send form.',
      ],
      keywords: ['kafka', 'broker', 'topic', 'sasl', 'ssl', 'consumer'],
    },
    {
      id: 'kafka-flows',
      title: 'Messages and flow linking',
      body: [
        'Messages are grouped by flowId, taken from the flowId/flowid/flow-id header, then the JSON content (resource.flowId first), then the message key. Groups show duration, can be collapsed, copied, downloaded or deleted.',
        'Search matches value, topic, flowId, key and headers. Pause freezes the list while new messages keep arriving; Follow newest keeps the latest message in view. Select messages to copy or delete them, or Export all as JSON.',
        'The last messages per connection are remembered between sessions (routiq.kafka.persistedMessages).',
      ],
      keywords: ['flowid', 'flow', 'search', 'pause', 'export'],
    },
    {
      id: 'kafka-send',
      title: 'Send messages',
      body: [
        'The Send tab produces a message with topic, optional key, headers (a JSON object) and value. "Use for Send" copies a received message into the form and "Resend" produces it again.',
      ],
      keywords: ['produce', 'send', 'resend', 'headers'],
    },
    {
      id: 'kafka-decoding',
      title: 'Decoding values',
      body: [
        'The "Value as" selector of a message switches between Auto, JSON, Text, Hex, Base64, Avro and Protobuf. Auto detects JSON and Schema Registry framed Avro; Hex and Base64 show the raw bytes. Tombstones (records with a null value) are labelled as such instead of showing an empty value.',
        'Avro: set the Schema Registry URL (and optional username/password) in the connection. Messages in the Confluent wire format (magic byte plus schema id) are decoded with the schema fetched from the registry.',
        'Protobuf: pick a local .proto file with Browse…, then set the message type (pkg.Type), or one type per topic as topic=pkg.Type lines. Choose Protobuf in "Value as" to decode.',
      ],
      keywords: ['avro', 'protobuf', 'schema registry', 'hex', 'base64', 'tombstone', 'decode', 'value as', 'compression', 'proto'],
    },
    {
      id: 'kafka-filters-replay',
      title: 'Filters, replay and export',
      body: [
        'Filters combine text search, a JSON path condition ($.status == \'FAILED\'), header key/value, partition, a from/to time range and errors only. Name a filter to save it and reuse it later.',
        'Replay produces the selected messages to another connection or topic, with an optional partition, rate limit and original timestamps; a dry run previews the result and replaying into the source topic needs an explicit acknowledgement. Read-only connections never produce.',
        'Export writes the messages as JSON, NDJSON or CSV; the Log file tab opens Routiq exports again.',
      ],
      keywords: ['filter', 'jsonpath', 'replay', 'export', 'import', 'csv', 'ndjson', 'start position', 'offset', 'timestamp', 'read-only'],
    },
    {
      id: 'kafka-log-file',
      title: 'Splunk JSON log file',
      body: ['The Log file tab imports a Splunk JSON export (single JSON, array or NDJSON) and shows it as flows, with search, container/level filters and ordering.'],
      keywords: ['splunk', 'json', 'log', 'ndjson'],
    },
    {
      id: 'kafka-admin',
      title: 'Cluster administration',
      body: [
        'The Topics tab lists every topic with partitions, replication, offsets and an approximate message count. Click a row for leader/replicas/ISR and read-only configs, "Add to listener" or "Consume" to pick it for the listener, create a topic with "New topic" or delete one (both ask for confirmation). Internal topics are hidden unless "Show internal" is on.',
        'The Consumer groups tab shows state, members, committed offsets and lag per partition. Auto-refresh polls every routiq.kafka.groupsRefreshSeconds. Empty groups can be deleted or have their offsets reset to earliest, latest or a timestamp.',
        'The Cluster tab lists brokers, the controller and the cluster id. Missing ACL permissions are reported as friendly errors; admin calls time out after routiq.kafka.adminTimeoutMs.',
      ],
      keywords: ['admin', 'topics', 'consumer group', 'lag', 'offsets', 'reset', 'cluster', 'broker', 'partitions'],
    },
  ],
};

const KEYBOARD_SHORTCUTS: HelpSection = {
  id: 'keyboard-shortcuts',
  title: 'Keyboard shortcuts',
  summary: 'Shortcuts available inside Routiq panels.',
  items: [],
  shortcuts: [
    { keys: 'Cmd/Ctrl+S', action: 'Save the request or the environments', where: 'Request and environment editors' },
    { keys: 'Enter', action: 'Send the request', where: 'URL field' },
    { keys: 'Shift+Alt+F', action: 'Prettify the body', where: 'JSON, XML and text body editors' },
    { keys: 'Ctrl+Space', action: 'Show schema suggestions', where: 'GraphQL query editor' },
    { keys: '↑ / ↓', action: 'Move in the suggestion list', where: 'Variable and GraphQL autocomplete' },
    { keys: 'Enter / Tab', action: 'Insert the highlighted suggestion', where: 'Variable and GraphQL autocomplete' },
    { keys: 'Esc', action: 'Dismiss suggestions', where: 'Variable and GraphQL autocomplete' },
    { keys: 'Enter / Shift+Enter', action: 'Next / previous match', where: 'Find in response' },
    { keys: 'Enter', action: 'Add a variable row', where: 'Environment variable name field' },
    { keys: 'Arrow keys', action: 'Resize the request/response split', where: 'Focused split divider' },
  ],
};

const FAQ: HelpSection = {
  id: 'faq',
  title: 'FAQ & troubleshooting',
  summary: 'Common questions and fixes.',
  items: [
    {
      id: 'faq-self-signed',
      title: 'Certificate errors with self-signed servers',
      body: ['Set routiq.rejectUnauthorized to false in settings. This disables TLS verification, so only do it for servers you trust.'],
      keywords: ['ssl', 'tls', 'certificate', 'unable to verify'],
    },
    {
      id: 'faq-scripts-disabled',
      title: 'Scripts are disabled',
      body: ['Scripts need consent per collection and a trusted workspace. Send a request with a script and choose Allow Scripts, and trust the workspace if prompted.'],
      keywords: ['script', 'trust', 'consent'],
    },
    {
      id: 'faq-timeout',
      title: 'Requests time out',
      body: ['Raise routiq.timeoutMs or the timeout field next to Send. Check the proxy configuration if a corporate proxy is required.'],
      keywords: ['timeout', 'proxy', 'slow'],
    },
    {
      id: 'faq-timeout-postman',
      title: 'Requests time out but work in Postman',
      body: [
        'Run Routiq: Diagnose Network for this Request (request ... menu, or the button on the error). It checks DNS, proxy, TCP, each transport and TLS and suggests settings.',
        'Common fix: set routiq.useVsCodeNetworking to true (system proxy/PAC and certificates) or set routiq.proxy. Tick "Use the real method and body" to also re-send the actual request.',
      ],
      keywords: ['timeout', 'postman', 'proxy', 'diagnose', 'network', 'pac', 'connect'],
    },
    {
      id: 'faq-missing-collections',
      title: 'My collections are missing',
      body: ['Check routiq.storagePath: a relative path resolves against the first workspace folder, so opening another folder shows a different set. The About page shows the directory in use.'],
      keywords: ['storage', 'missing', 'empty'],
    },
    {
      id: 'faq-variable-not-replaced',
      title: 'A {{variable}} is not replaced',
      body: ['Unknown placeholders stay untouched. Check the variable name, that the row is enabled and that the intended environment is active.'],
      keywords: ['variable', 'environment', 'placeholder'],
    },
    {
      id: 'faq-report-bug',
      title: 'Reporting a problem',
      body: ['Open the About page and use Copy diagnostics to attach version information and settings (no secrets) to your report.'],
      keywords: ['bug', 'issue', 'diagnostics', 'support'],
    },
  ],
};

export const HELP_SECTIONS: HelpSection[] = [
  GETTING_STARTED,
  REQUESTS_AND_TABS,
  VARIABLES_AND_ENVIRONMENTS,
  IMPORT_EXPORT,
  SCRIPTS_AND_TESTS,
  COLLECTION_RUNNER,
  GRAPHQL,
  STREAMS,
  GRPC,
  KAFKA,
  STORAGE_AND_GIT,
  NETWORK_SETTINGS,
  KEYBOARD_SHORTCUTS,
  FAQ,
];
