export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
}

export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'form' | 'multipart' | 'binary' | 'graphql';

export interface MultipartField {
  key: string;
  kind: 'text' | 'file';
  value: string;
  enabled: boolean;
}

export interface RequestBody {
  type: BodyType;
  text: string;
  form: KeyValue[];
  multipart?: MultipartField[];
  filePath?: string;
  graphqlVariables?: string;
  graphqlOperationName?: string;
}

export type Auth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apikey'; key: string; value: string; location: ApiKeyLocation }
  | { type: 'digest'; username: string; password: string }
  | OAuth2Auth;

export type ApiKeyLocation = 'header' | 'query';

export type OAuth2Grant = 'client_credentials' | 'password';

export interface OAuth2Auth {
  type: 'oauth2';
  grant: OAuth2Grant;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  username: string;
  password: string;
}

export type RequestKind = 'http' | 'sse' | 'websocket' | 'grpc' | 'graphql';

export const REQUEST_KINDS: RequestKind[] = ['http', 'sse', 'websocket', 'grpc', 'graphql'];

export interface GrpcConfig {
  tls: boolean;
  protoFiles: string[];
  importPaths: string[];
  service: string;
  method: string;
}

export const DEFAULT_GRPC_CONFIG: GrpcConfig = { tls: false, protoFiles: [], importPaths: [], service: '', method: '' };

export interface RequestModel {
  id: string;
  name: string;
  kind?: RequestKind;
  stream?: boolean;
  subprotocols?: string;
  autoReconnect?: boolean;
  grpc?: GrpcConfig;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: Auth;
  timeoutMs?: number;
  scripts?: RequestScripts;
}

export interface RequestScripts {
  pre: string;
  post: string;
}

export interface ScriptTestResult {
  name: string;
  passed: boolean;
  message?: string;
}

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error';

export interface ScriptConsoleEntry {
  level: ConsoleLevel;
  text: string;
}

export interface ScriptsOutcome {
  tests: ScriptTestResult[];
  console: ScriptConsoleEntry[];
  errors: string[];
}

export interface FolderModel {
  id: string;
  name: string;
  items: CollectionEntry[];
}

export type CollectionEntry = RequestModel | FolderModel;

export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
}

export interface Collection {
  id: string;
  name: string;
  items: CollectionEntry[];
  variables: KeyValue[];
  environments: Environment[];
  activeEnvironmentId?: string;
  order?: number;
}

export const EXPORT_FORMAT_VERSION = 2;
export const COLLECTION_FILE_VERSION = 2;

export interface ExportFile {
  version: number;
  collections: Collection[];
}

export interface EnvironmentSummary {
  id: string;
  name: string;
}

export interface EnvironmentsDraft {
  variables: KeyValue[];
  environments: Environment[];
  activeEnvironmentId?: string;
}

export interface ResponseModel {
  status: number;
  statusText: string;
  timeMs: number;
  sizeBytes: number;
  headers: Array<[string, string]>;
  body: string;
  error?: string;
  timing?: ResponseTiming;
  scripts?: ScriptsOutcome;
}

export interface ResponseTiming {
  waitMs: number;
  downloadMs: number;
  redirects: number;
}

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export interface SseLogEntry {
  sequence: number;
  timestamp: number;
  event: SseEvent;
}

export type MessageDirection = 'sent' | 'received';

export interface WebSocketLogEntry {
  sequence: number;
  timestamp: number;
  direction: MessageDirection;
  text: string;
  sizeBytes: number;
  binary: boolean;
  payloadBase64?: string;
}

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface GrpcMethodDescription {
  name: string;
  requestStream: boolean;
  responseStream: boolean;
  exampleBody: string;
}

export interface GrpcServiceDescription {
  name: string;
  methods: GrpcMethodDescription[];
}

export interface GrpcCallStatus {
  code: number;
  codeName: string;
  details: string;
  trailers: Array<[string, string]>;
}

export type GrpcPathKind = 'protoFile' | 'importPath';

export type StreamHostMessage =
  | { type: 'streamStatus'; status: StreamStatus; detail?: string }
  | { type: 'grpcStatus'; status: GrpcCallStatus }
  | { type: 'grpcServices'; services: GrpcServiceDescription[]; error?: string }
  | { type: 'grpcPathPicked'; pathKind: GrpcPathKind; path: string }
  | { type: 'sseEvent'; entry: SseLogEntry }
  | { type: 'wsMessage'; entry: WebSocketLogEntry };

export type StreamWebviewMessage =
  | { type: 'streamConnect'; request: RequestModel }
  | { type: 'streamDisconnect' }
  | { type: 'wsSend'; text: string }
  | { type: 'grpcEnd' }
  | { type: 'grpcLoadProto'; request: RequestModel }
  | { type: 'grpcPickPath'; pathKind: GrpcPathKind };

export interface VariableSuggestion {
  name: string;
  source: 'base' | 'environment' | 'dynamic';
  value?: string;
  isSecret?: boolean;
}

export type HostToWebviewMessage =
  | { type: 'variableSuggestions'; variables: VariableSuggestion[] }
  | { type: 'load'; request: RequestModel; collectionName: string }
  | { type: 'environmentState'; environments: EnvironmentSummary[]; activeEnvironmentId?: string }
  | { type: 'environmentsLoad'; collectionName: string; draft: EnvironmentsDraft }
  | { type: 'sending' }
  | { type: 'response'; response: ResponseModel }
  | { type: 'saved' }
  | { type: 'filePicked'; target: FilePickTarget; path: string }
  | { type: 'oauthTokenResult'; ok: boolean; message: string }
  | StreamHostMessage
  | GraphqlHostMessage
  | HistoryHostMessage;

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'send'; request: RequestModel }
  | { type: 'save'; request: RequestModel }
  | { type: 'copyCurl'; request: RequestModel }
  | { type: 'fetchOAuthToken'; request: RequestModel }
  | { type: 'setActiveEnvironment'; environmentId?: string }
  | { type: 'manageEnvironments' }
  | { type: 'pickFile'; target: FilePickTarget }
  | { type: 'saveResponseBody'; body: string; extension: string }
  | ({ type: 'saveEnvironments' } & EnvironmentsDraft)
  | StreamWebviewMessage
  | GraphqlWebviewMessage
  | HistoryWebviewMessage;

export type FilePickTarget = { kind: 'binary' } | { kind: 'multipart'; index: number };

export interface StreamHistoryMessage {
  timestamp: number;
  direction: MessageDirection;
  label?: string;
  text: string;
}

export interface StreamHistorySession {
  messages: StreamHistoryMessage[];
  totalMessages: number;
  truncated: boolean;
  closeDetail?: string;
  grpcStatus?: GrpcCallStatus;
}

export interface HistoryEntry {
  id: string;
  kind?: RequestKind;
  session?: StreamHistorySession;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  requestHeaders: Array<[string, string]>;
  requestBody?: string;
  requestSnapshot: RequestModel;
  responseHeaders: Array<[string, string]>;
  responseBody: string;
  bodyTruncated: boolean;
  error?: string;
}

export interface HistorySummary {
  id: string;
  kind?: RequestKind;
  timestamp: number;
  method: string;
  status: number;
  statusText: string;
  durationMs: number;
  error?: string;
}

export type HistoryHostMessage =
  | { type: 'historyList'; entries: HistorySummary[] }
  | { type: 'historyEntry'; entry: HistoryEntry };

export type HistoryWebviewMessage =
  | { type: 'historySelect'; entryId: string }
  | { type: 'historyDelete'; entryId: string }
  | { type: 'historyClear' };

export type GraphqlTypeKind = 'object' | 'interface' | 'input' | 'enum' | 'union' | 'scalar';

export interface GraphqlArgumentSummary {
  name: string;
  type: string;
  description?: string;
  defaultValue?: string;
}

export interface GraphqlFieldSummary {
  name: string;
  type: string;
  namedType: string;
  description?: string;
  deprecated?: boolean;
  args: GraphqlArgumentSummary[];
}

export interface GraphqlTypeSummary {
  name: string;
  kind: GraphqlTypeKind;
  description?: string;
  fields: GraphqlFieldSummary[];
  members: string[];
}

export interface GraphqlSchemaSummary {
  queryType?: string;
  mutationType?: string;
  subscriptionType?: string;
  types: GraphqlTypeSummary[];
}

export type GraphqlHostMessage =
  | { type: 'graphqlSchema'; schema: GraphqlSchemaSummary; fetchedAt: number; cached: boolean }
  | { type: 'graphqlSchemaError'; message: string }
  | { type: 'graphqlSchemaFetching' };

export type GraphqlWebviewMessage = { type: 'graphqlFetchSchema'; request: RequestModel } | { type: 'graphqlLoadCachedSchema'; request: RequestModel };
