import { Auth, OAuth2Auth, OAuth2Grant } from '../shared/types';
import { Json, isObject } from './jsonValues';

export interface InsomniaAuthImport {
  auth: Auth;
  warnings: string[];
}

const UNSUPPORTED_AUTH_NAMES: Record<string, string> = {
  hawk: 'Hawk',
  ntlm: 'NTLM',
  asap: 'ASAP (Atlassian)',
  netrc: '.netrc',
  oauth1: 'OAuth 1.0',
};

const SUPPORTED_OAUTH2_GRANTS: OAuth2Grant[] = ['authorization_code', 'client_credentials', 'password'];
const DEFAULT_TOKEN_PREFIX = 'Bearer';
const NO_AUTH: Auth = { type: 'none' };

function text(source: Json, key: string): string {
  const value = source[key];
  return value === undefined || value === null ? '' : String(value);
}

function skipped(label: string, reason: string): InsomniaAuthImport {
  return { auth: NO_AUTH, warnings: [`"${label}": ${reason} is not supported and was skipped.`] };
}

function imported(auth: Auth, warnings: string[] = []): InsomniaAuthImport {
  return { auth, warnings };
}

function importBearer(source: Json): InsomniaAuthImport {
  const token = text(source, 'token');
  const prefix = text(source, 'prefix').trim();
  if (prefix === '' || prefix === DEFAULT_TOKEN_PREFIX) {
    return imported({ type: 'bearer', token });
  }
  return imported({ type: 'apikey', key: 'Authorization', value: `${prefix} ${token}`, location: 'header' });
}

function importApiKey(source: Json): InsomniaAuthImport {
  return imported({ type: 'apikey', key: text(source, 'key'), value: text(source, 'value'), location: source.addTo === 'queryParams' ? 'query' : 'header' });
}

function importAwsIam(source: Json): InsomniaAuthImport {
  return imported({
    type: 'awsv4',
    accessKey: text(source, 'accessKeyId'),
    secretKey: text(source, 'secretAccessKey'),
    sessionToken: text(source, 'sessionToken'),
    region: text(source, 'region'),
    service: text(source, 'service'),
  });
}

function oauth2Grant(source: Json): string {
  return text(source, 'grantType') || 'authorization_code';
}

function isSupportedGrant(grant: string): grant is OAuth2Grant {
  return SUPPORTED_OAUTH2_GRANTS.includes(grant as OAuth2Grant);
}

function authorizationCodeFields(source: Json): Pick<OAuth2Auth, 'authUrl' | 'redirectUrl' | 'usePkce'> {
  return { authUrl: text(source, 'authorizationUrl'), redirectUrl: text(source, 'redirectUrl'), usePkce: source.usePkce === true };
}

function importOAuth2(source: Json, label: string): InsomniaAuthImport {
  const grant = oauth2Grant(source);
  if (!isSupportedGrant(grant)) {
    return skipped(label, `OAuth 2.0 grant "${grant}" (only authorization_code, client_credentials and password work)`);
  }
  return imported({
    type: 'oauth2',
    grant,
    tokenUrl: text(source, 'accessTokenUrl'),
    clientId: text(source, 'clientId'),
    clientSecret: text(source, 'clientSecret'),
    scope: text(source, 'scope'),
    username: text(source, 'username'),
    password: text(source, 'password'),
    ...(grant === 'authorization_code' && authorizationCodeFields(source)),
  });
}

function importCredentials(type: 'basic' | 'digest', source: Json): InsomniaAuthImport {
  return imported({ type, username: text(source, 'username'), password: text(source, 'password') });
}

function importTyped(source: Json, type: string, label: string): InsomniaAuthImport {
  switch (type) {
    case 'bearer':
      return importBearer(source);
    case 'basic':
    case 'digest':
      return importCredentials(type, source);
    case 'apikey':
      return importApiKey(source);
    case 'iam':
      return importAwsIam(source);
    case 'oauth2':
      return importOAuth2(source, label);
    case 'none':
      return imported(NO_AUTH);
    default:
      return skipped(label, `auth type "${type}"${UNSUPPORTED_AUTH_NAMES[type] ? ` (${UNSUPPORTED_AUTH_NAMES[type]})` : ''}`);
  }
}

export function inheritsInsomniaAuth(source: unknown): boolean {
  return !isObject(source) || typeof source.type !== 'string' || source.type === '';
}

export function importInsomniaAuth(source: unknown, label: string): InsomniaAuthImport {
  if (!isObject(source) || source.disabled === true || typeof source.type !== 'string') {
    return imported(NO_AUTH);
  }
  return importTyped(source, source.type, label);
}

export function resolveInsomniaAuth(source: unknown, label: string, inherited: Auth): InsomniaAuthImport {
  return inheritsInsomniaAuth(source) ? imported(inherited) : importInsomniaAuth(source, label);
}
