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

function apiKeyAuth(scheme: Json): Auth | undefined {
  if ((scheme.in !== 'header' && scheme.in !== 'query') || typeof scheme.name !== 'string' || scheme.name === '') {
    return undefined;
  }
  return { type: 'apikey', key: scheme.name, value: placeholder(AUTH_VARIABLES.apiKey), location: scheme.in };
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
    return isObject(flows.password) ? { grant: 'password', flow: flows.password } : undefined;
  }
  if (scheme.flow === 'application') {
    return { grant: 'client_credentials', flow: scheme };
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
  };
}

function schemeToAuth(scheme: Json, requiredScopes: unknown): Auth | undefined {
  if (scheme.type === 'http') {
    return httpAuth(scheme);
  }
  if (scheme.type === 'basic') {
    return basicAuth();
  }
  if (scheme.type === 'oauth2') {
    return oauth2Auth(scheme, requiredScopes);
  }
  return scheme.type === 'apiKey' ? apiKeyAuth(scheme) : undefined;
}

export function requiresUnsupportedSecurity(operation: Json, root: Json, auth: Auth): boolean {
  return auth.type === 'none' && activeRequirements(operation, root).some((requirement) => Object.keys(requirement).length > 0);
}

export function resolveOperationAuth(operation: Json, root: Json, resolve: RefResolver): Auth {
  const schemes = securitySchemes(root);
  for (const requirement of activeRequirements(operation, root)) {
    for (const name of Object.keys(requirement)) {
      const scheme = isObject(schemes[name]) ? resolve(schemes[name]) : undefined;
      const auth = scheme && schemeToAuth(scheme, requirement[name]);
      if (auth) {
        return auth;
      }
    }
  }
  return { type: 'none' };
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

export function authVariablesFor(requests: RequestModel[]): KeyValue[] {
  const names = new Set(requests.flatMap((request) => variablesUsedBy(request.auth)));
  return [...names].map((key) => ({ key, value: '', enabled: true }));
}
