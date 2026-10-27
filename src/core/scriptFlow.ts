import { Collection, HTTP_METHODS, HttpMethod, KeyValue, RequestModel, ResponseModel, ScriptsOutcome } from '../shared/types';
import { findActiveEnvironment } from './environments';
import { ScriptRequest, ScriptResponse, ScriptRunResult } from './scriptSandbox';
import { activePairs } from './url';

export type ScriptPhase = 'pre-request' | 'post-response';

export function toScriptRequest(request: RequestModel): ScriptRequest {
  const headers: Record<string, string> = {};
  for (const header of activePairs(request.headers)) {
    headers[header.key] = header.value;
  }
  return { url: request.url, method: request.method, headers, body: request.body.text };
}

function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as string[]).includes(value);
}

function mergeHeaders(original: KeyValue[], scripted: Record<string, string>): KeyValue[] {
  const disabled = original.filter((header) => !header.enabled || header.key.trim() === '');
  const enabled = Object.entries(scripted).map(([key, value]) => ({ key, value, enabled: true }));
  return [...enabled, ...disabled];
}

export function applyScriptRequest(request: RequestModel, scripted: ScriptRequest): RequestModel {
  const method = scripted.method.toUpperCase();
  return {
    ...request,
    url: scripted.url,
    method: isHttpMethod(method) ? method : request.method,
    headers: mergeHeaders(request.headers, scripted.headers),
    body: { ...request.body, text: scripted.body },
  };
}

export function toScriptResponse(response: ResponseModel): ScriptResponse {
  const headers: Record<string, string> = {};
  for (const [name, value] of response.headers) {
    const key = name.toLowerCase();
    headers[key] = key in headers ? `${headers[key]}, ${value}` : value;
  }
  return { status: response.status, statusText: response.statusText, timeMs: response.timeMs, headers, body: response.body };
}

function describeFailure(phase: ScriptPhase, error: string): string {
  return `${phase} script: ${error}`;
}

export function mergeScriptResults(phased: Array<{ phase: ScriptPhase; result: ScriptRunResult }>): ScriptsOutcome {
  return {
    tests: phased.flatMap(({ result }) => result.tests),
    console: phased.flatMap(({ result }) => result.console),
    errors: phased.flatMap(({ phase, result }) => (result.error ? [describeFailure(phase, result.error)] : [])),
  };
}

export function hasScriptActivity(outcome: ScriptsOutcome): boolean {
  return outcome.tests.length > 0 || outcome.console.length > 0 || outcome.errors.length > 0;
}

function upsertVariable(variables: KeyValue[], key: string, value: string): KeyValue[] {
  const index = variables.findIndex((variable) => variable.key === key);
  if (index === -1) {
    return [...variables, { key, value, enabled: true }];
  }
  if (variables[index].secret) {
    return variables;
  }
  return variables.map((variable, position) => (position === index ? { ...variable, value, enabled: true } : variable));
}

export function applyVariableChanges(collection: Collection, changes: Record<string, string>): Collection {
  const entries = Object.entries(changes);
  const active = findActiveEnvironment(collection);
  if (entries.length === 0) {
    return collection;
  }
  if (!active) {
    return { ...collection, variables: entries.reduce((variables, [key, value]) => upsertVariable(variables, key, value), collection.variables) };
  }
  const variables = entries.reduce((current, [key, value]) => upsertVariable(current, key, value), active.variables);
  return {
    ...collection,
    environments: collection.environments.map((environment) => (environment.id === active.id ? { ...environment, variables } : environment)),
  };
}
