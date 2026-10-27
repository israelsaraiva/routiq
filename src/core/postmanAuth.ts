import { Auth, OAuth2Auth, OAuth2Grant } from '../shared/types';
import { Json, isObject } from './jsonValues';

export interface PostmanAuthImport {
  auth: Auth;
  warnings: string[];
}

const UNSUPPORTED_AUTH_NAMES: Record<string, string> = {
  awsv4: 'AWS Signature v4',
  hawk: 'Hawk',
  ntlm: 'NTLM',
  edgegrid: 'Akamai EdgeGrid',
  oauth1: 'OAuth 1.0',
  jwt: 'JWT',
  asap: 'ASAP (Atlassian)',
};

const UNSUPPORTED_AUTH_HINTS: Record<string, string> = {
  awsv4: 'Add the signed headers manually or sign the request outside Routiq.',
  oauth1: 'Compute the Authorization header manually.',
};

const OAUTH2_GRANTS: Record<string, OAuth2Grant> = {
  client_credentials: 'client_credentials',
  password_credentials: 'password',
  password: 'password',
};

const OAUTH2_GRANT_EXPORT_NAMES: Record<OAuth2Grant, string> = {
  client_credentials: 'client_credentials',
  password: 'password_credentials',
};

const DEFAULT_OAUTH2_GRANT = 'authorization_code';
const DIGEST_NEGOTIATED_FIELDS = ['realm', 'nonce', 'algorithm', 'qop', 'nonceCount', 'clientNonce', 'opaque'];
const DEFAULT_DIGEST_ALGORITHM = 'MD5';
const DEFAULT_TOKEN_PREFIX = 'Bearer';

function authValue(entries: unknown, key: string): string {
  const raw = Array.isArray(entries) ? entries.find((entry) => isObject(entry) && entry.key === key)?.value : isObject(entries) ? entries[key] : undefined;
  return raw === undefined || raw === null ? '' : String(raw);
}

function apiKeyLocation(entries: unknown): 'header' | 'query' {
  return authValue(entries, 'in') === 'query' ? 'query' : 'header';
}

function describeUnsupported(type: string): string {
  const name = UNSUPPORTED_AUTH_NAMES[type];
  return name ? `auth type "${type}" (${name})` : `auth type "${type}"`;
}

function unsupportedAuth(label: string, type: string): PostmanAuthImport {
  const hint = UNSUPPORTED_AUTH_HINTS[type];
  const message = `"${label}": ${describeUnsupported(type)} is not supported and was skipped.${hint ? ` ${hint}` : ''}`;
  return { auth: { type: 'none' }, warnings: [message] };
}

function oauth2IgnoredSettings(entries: unknown): string[] {
  const ignored: string[] = [];
  if (authValue(entries, 'addTokenTo') === 'queryParams') {
    ignored.push('adding the token to the query string (it is sent in the Authorization header)');
  }
  const prefix = authValue(entries, 'headerPrefix');
  if (prefix !== '' && prefix !== DEFAULT_TOKEN_PREFIX) {
    ignored.push(`the "${prefix}" header prefix (the token type returned by the server is used)`);
  }
  if (authValue(entries, 'client_authentication') === 'body') {
    ignored.push('sending client credentials in the request body (they are sent as Basic auth)');
  }
  return ignored;
}

function toOAuth2(entries: unknown, grant: OAuth2Grant): OAuth2Auth {
  return {
    type: 'oauth2',
    grant,
    tokenUrl: authValue(entries, 'accessTokenUrl'),
    clientId: authValue(entries, 'clientId'),
    clientSecret: authValue(entries, 'clientSecret'),
    scope: authValue(entries, 'scope'),
    username: authValue(entries, 'username'),
    password: authValue(entries, 'password'),
  };
}

function importOAuth2(entries: unknown, label: string): PostmanAuthImport {
  const grantName = authValue(entries, 'grant_type') || DEFAULT_OAUTH2_GRANT;
  const grant = OAUTH2_GRANTS[grantName];
  if (!grant) {
    return { auth: { type: 'none' }, warnings: [`"${label}": OAuth 2.0 grant "${grantName}" is not supported (only client_credentials and password) and was skipped.`] };
  }
  const ignored = oauth2IgnoredSettings(entries);
  const warnings = ignored.length > 0 ? [`"${label}": OAuth 2.0 imported, but Routiq ignores ${ignored.join('; ')}.`] : [];
  return { auth: toOAuth2(entries, grant), warnings };
}

function importDigest(entries: unknown, label: string): PostmanAuthImport {
  const customized = DIGEST_NEGOTIATED_FIELDS.filter((field) => {
    const value = authValue(entries, field);
    return value !== '' && !(field === 'algorithm' && value === DEFAULT_DIGEST_ALGORITHM);
  });
  const warnings = customized.length > 0 ? [`"${label}": Digest ${customized.join(', ')} ignored; Routiq negotiates them from the server challenge.`] : [];
  return { auth: { type: 'digest', username: authValue(entries, 'username'), password: authValue(entries, 'password') }, warnings };
}

function importSupportedAuth(source: Json, label: string): PostmanAuthImport {
  switch (source.type) {
    case 'bearer':
      return { auth: { type: 'bearer', token: authValue(source.bearer, 'token') }, warnings: [] };
    case 'basic':
      return { auth: { type: 'basic', username: authValue(source.basic, 'username'), password: authValue(source.basic, 'password') }, warnings: [] };
    case 'apikey':
      return {
        auth: { type: 'apikey', key: authValue(source.apikey, 'key'), value: authValue(source.apikey, 'value'), location: apiKeyLocation(source.apikey) },
        warnings: [],
      };
    case 'digest':
      return importDigest(source.digest, label);
    case 'oauth2':
      return importOAuth2(source.oauth2, label);
    default:
      return unsupportedAuth(label, String(source.type));
  }
}

export function inheritsPostmanAuth(source: unknown): boolean {
  return !isObject(source) || typeof source.type !== 'string' || source.type === 'inherit';
}

export function importPostmanAuth(source: unknown, label: string): PostmanAuthImport {
  if (!isObject(source) || source.type === 'noauth') {
    return { auth: { type: 'none' }, warnings: [] };
  }
  return importSupportedAuth(source, label);
}

function authEntries(values: Record<string, string>): Json[] {
  return Object.entries(values).map(([key, value]) => ({ key, value, type: 'string' }));
}

function exportOAuth2(auth: OAuth2Auth): Json {
  const credentials: Record<string, string> = auth.grant === 'password' ? { username: auth.username, password: auth.password } : {};
  return {
    type: 'oauth2',
    oauth2: authEntries({
      grant_type: OAUTH2_GRANT_EXPORT_NAMES[auth.grant],
      accessTokenUrl: auth.tokenUrl,
      clientId: auth.clientId,
      clientSecret: auth.clientSecret,
      scope: auth.scope,
      ...credentials,
      addTokenTo: 'header',
      headerPrefix: DEFAULT_TOKEN_PREFIX,
      client_authentication: 'header',
    }),
  };
}

export function exportPostmanAuth(auth: Auth): Json | undefined {
  switch (auth.type) {
    case 'bearer':
      return { type: 'bearer', bearer: authEntries({ token: auth.token }) };
    case 'basic':
      return { type: 'basic', basic: authEntries({ username: auth.username, password: auth.password }) };
    case 'digest':
      return { type: 'digest', digest: authEntries({ username: auth.username, password: auth.password, algorithm: DEFAULT_DIGEST_ALGORITHM }) };
    case 'apikey':
      return { type: 'apikey', apikey: authEntries({ key: auth.key, value: auth.value, in: auth.location }) };
    case 'oauth2':
      return exportOAuth2(auth);
    default:
      return undefined;
  }
}
