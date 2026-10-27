import { Auth, KeyValue, OAuth2Auth, OAuth2Grant, RequestModel } from '../shared/types';
import { Json, isObject } from './jsonValues';
import { RefResolver } from './openapiSchemaExample';

export const AUTH_VARIABLES = {
  bearerToken: 'bearerToken',
  username: 'username',
  password: 'password',
  apiKey: 'apiKey',
  clientId: 'clientId',
  clientSecret: 'clientSecret',
} as const;

function placeholder(name: string): string {
  return `{{${name}}}`;
}

function securitySchemes(root: Json): Json {
  const source = isObject(root.components) && isObject(root.components.securitySchemes) ? root.components.securitySchemes : root.securityDefinitions;
  return isObject(source) ? source : {};
}

function activeRequirements(operation: Json, root: Json): Json[] {
  const requirements = Array.isArray(operation.security) ? operation.security : root.security;
  return Array.isArray(requirements) ? requirements.filter(isObject) : [];
}

export interface OperationSecurity {
  auth: Auth;
  headers: KeyValue[];
  warning?: string;
}

interface SchemeResolution {
  auth: Auth;
  headers: KeyValue[];
}

const NO_AUTH: Auth = { type: 'none' };

function authOnly(auth: Auth | undefined): SchemeResolution | undefined {
  return auth && { auth, headers: [] };
}

function apiKeyResolution(scheme: Json): SchemeResolution | undefined {
  if (typeof scheme.name !== 'string' || scheme.name === '') {
    return undefined;
  }
  const value = placeholder(AUTH_VARIABLES.apiKey);
  if (scheme.in === 'cookie') {
    return { auth: NO_AUTH, headers: [{ key: 'Cookie', value: `${scheme.name}=${value}`, enabled: true }] };
  }
  return scheme.in === 'header' || scheme.in === 'query' ? authOnly({ type: 'apikey', key: scheme.name, value, location: scheme.in }) : undefined;
}

function httpAuth(scheme: Json): Auth | undefined {
  const httpScheme = String(scheme.scheme ?? '').toLowerCase();
  if (httpScheme === 'bearer') {
    return { type: 'bearer', token: placeholder(AUTH_VARIABLES.bearerToken) };
  }
  return httpScheme === 'basic' ? basicAuth() : undefined;
}

function basicAuth(): Auth {
  return { type: 'basic', username: placeholder(AUTH_VARIABLES.username), password: placeholder(AUTH_VARIABLES.password) };
}

function oauth2Flow(scheme: Json): { grant: OAuth2Grant; flow: Json } | undefined {
  if (isObject(scheme.flows)) {
    const flows = scheme.flows;
    if (isObject(flows.clientCredentials)) {
      return { grant: 'client_credentials', flow: flows.clientCredentials };
    }
    if (isObject(flows.password)) {
      return { grant: 'password', flow: flows.password };
    }
    return isObject(flows.authorizationCode) ? { grant: 'authorization_code', flow: flows.authorizationCode } : undefined;
  }
  if (scheme.flow === 'application') {
    return { grant: 'client_credentials', flow: scheme };
  }
  if (scheme.flow === 'accessCode') {
    return { grant: 'authorization_code', flow: scheme };
  }
  return scheme.flow === 'password' ? { grant: 'password', flow: scheme } : undefined;
}

function requestedScopes(requiredScopes: unknown, flow: Json): string {
  const required = Array.isArray(requiredScopes) ? requiredScopes.filter((scope) => typeof scope === 'string') : [];
  const scopes = required.length > 0 ? required : isObject(flow.scopes) ? Object.keys(flow.scopes) : [];
  return scopes.join(' ');
}

function oauth2Auth(scheme: Json, requiredScopes: unknown): Auth | undefined {
  const selected = oauth2Flow(scheme);
  if (!selected || typeof selected.flow.tokenUrl !== 'string' || selected.flow.tokenUrl === '') {
    return undefined;
  }
  return {
    type: 'oauth2',
    grant: selected.grant,
    tokenUrl: selected.flow.tokenUrl,
    clientId: placeholder(AUTH_VARIABLES.clientId),
    clientSecret: placeholder(AUTH_VARIABLES.clientSecret),
    scope: requestedScopes(requiredScopes, selected.flow),
    username: selected.grant === 'password' ? placeholder(AUTH_VARIABLES.username) : '',
    password: selected.grant === 'password' ? placeholder(AUTH_VARIABLES.password) : '',
    ...(selected.grant === 'authorization_code' && { authUrl: String(selected.flow.authorizationUrl ?? ''), redirectUrl: '', usePkce: true }),
  };
}

function schemeResolution(scheme: Json, requiredScopes: unknown): SchemeResolution | undefined {
  if (scheme.type === 'http') {
    return authOnly(httpAuth(scheme));
  }
  if (scheme.type === 'basic') {
    return authOnly(basicAuth());
  }
  if (scheme.type === 'oauth2') {
    return authOnly(oauth2Auth(scheme, requiredScopes));
  }
  return scheme.type === 'apiKey' ? apiKeyResolution(scheme) : undefined;
}

function unsupportedSecurityWarning(name: string, openIdSchemes: string[]): string {
  if (openIdSchemes.length > 0) {
    return `"${name}": OpenID Connect scheme "${openIdSchemes[0]}" is not supported; auth was left empty. Configure OAuth 2.0 manually.`;
  }
  return `"${name}": none of the declared security schemes is supported; auth was left empty.`;
}

export function resolveOperationSecurity(operation: Json, root: Json, resolve: RefResolver, name: string): OperationSecurity {
  const schemes = securitySchemes(root);
  const requirements = activeRequirements(operation, root);
  const openIdSchemes: string[] = [];
  for (const requirement of requirements) {
    for (const schemeName of Object.keys(requirement)) {
      const scheme = isObject(schemes[schemeName]) ? resolve(schemes[schemeName]) : undefined;
      if (scheme?.type === 'openIdConnect') {
        openIdSchemes.push(schemeName);
      }
      const resolution = scheme && schemeResolution(scheme, requirement[schemeName]);
      if (resolution) {
        return resolution;
      }
    }
  }
  const required = requirements.some((requirement) => Object.keys(requirement).length > 0);
  return { auth: NO_AUTH, headers: [], ...(required && { warning: unsupportedSecurityWarning(name, openIdSchemes) }) };
}

function oauth2VariablesOf(auth: OAuth2Auth): string[] {
  const credentials = [AUTH_VARIABLES.clientId, AUTH_VARIABLES.clientSecret];
  return auth.grant === 'password' ? [...credentials, AUTH_VARIABLES.username, AUTH_VARIABLES.password] : credentials;
}

function variablesUsedBy(auth: Auth): string[] {
  switch (auth.type) {
    case 'bearer':
      return [AUTH_VARIABLES.bearerToken];
    case 'basic':
      return [AUTH_VARIABLES.username, AUTH_VARIABLES.password];
    case 'apikey':
      return [AUTH_VARIABLES.apiKey];
    case 'oauth2':
      return oauth2VariablesOf(auth);
    default:
      return [];
  }
}

function variablesUsedByHeaders(headers: KeyValue[]): string[] {
  return Object.values(AUTH_VARIABLES).filter((name) => headers.some((header) => header.value.includes(placeholder(name))));
}

export function authVariablesFor(requests: RequestModel[]): KeyValue[] {
  const names = new Set(requests.flatMap((request) => [...variablesUsedBy(request.auth), ...variablesUsedByHeaders(request.headers)]));
  return [...names].map((key) => ({ key, value: '', enabled: true }));
}
