import * as vscode from 'vscode';
import { effectiveTimeoutMs } from '../core/network';
import { PreparedRequest } from '../core/requestBuilder';
import { resolveCollectionVariables } from '../core/environments';
import { ScriptPhase, applyScriptRequest, hasScriptActivity, mergeScriptResults, toScriptRequest, toScriptResponse } from '../core/scriptFlow';
import { ScriptDecision, requestHasScripts } from '../core/scriptConsent';
import { ScriptInput, ScriptRunResult, emptyScriptResult, runScript } from '../core/scriptSandbox';
import { RequestModel, ResponseModel } from '../shared/types';
import { CookieStore } from './cookieStore';
import { sendRequest } from './httpClient';
import { buildSendOptions, defaultTimeoutMs } from './networkSettings';
import { ScriptPermission } from './scriptConsent';
import { SecretVault } from './secretVault';
import { Storage } from './storage';

const DEFAULT_SCRIPT_TIMEOUT_MS = 5000;

export type PrepareRequest = (request: RequestModel, variables: Record<string, string>, timeoutMs: number) => Promise<PreparedRequest>;

export interface ScriptedExchange {
  prepared: PreparedRequest;
  effectiveRequest: RequestModel;
  response: ResponseModel;
}

function scriptTimeoutMs(): number {
  return vscode.workspace.getConfiguration('routiq').get<number>('scripts.timeoutMs', DEFAULT_SCRIPT_TIMEOUT_MS);
}

interface VariableScope {
  values: Record<string, string>;
  changes: Record<string, string>;
}

function runPhase(source: string, input: ScriptInput, decision: ScriptDecision, signal?: AbortSignal): Promise<ScriptRunResult> {
  if (!decision.allowed && source.trim() !== '') {
    return Promise.resolve({ ...emptyScriptResult(input.request), error: decision.reason });
  }
  return runScript(source, input, scriptTimeoutMs(), signal);
}

function absorb(scope: VariableScope, result: ScriptRunResult): ScriptRunResult {
  Object.assign(scope.values, result.variableChanges);
  Object.assign(scope.changes, result.variableChanges);
  return result;
}

const ALWAYS_ALLOWED: ScriptPermission = { check: () => Promise.resolve({ allowed: true }) };

export class ScriptedSender {
  constructor(
    private readonly storage: Storage,
    private readonly cookies: CookieStore,
    private readonly vault: SecretVault,
    private readonly permission: ScriptPermission = ALWAYS_ALLOWED,
  ) {}

  async send(requestId: string, request: RequestModel, prepare: PrepareRequest, signal?: AbortSignal): Promise<ScriptedExchange> {
    const location = this.storage.findRequest(requestId);
    const collectionId = location?.collection.id;
    const decision = await this.decideScripts(request, collectionId, location?.collection.name ?? '');
    const scope: VariableScope = { values: await this.currentVariables(requestId), changes: {} };
    const preInput = { variables: scope.values, request: toScriptRequest(request) };
    const preResult = absorb(scope, await runPhase(request.scripts?.pre ?? '', preInput, decision, signal));
    const effectiveRequest = preResult.request ? applyScriptRequest(request, preResult.request) : request;
    try {
      const timeoutMs = effectiveTimeoutMs(effectiveRequest.timeoutMs, defaultTimeoutMs());
      const prepared = await prepare(effectiveRequest, scope.values, timeoutMs);
      const options = { ...(await this.sendOptionsFor(collectionId, effectiveRequest, prepared.url)), signal };
      const response = await sendRequest(prepared, options);
      const postResult = response.error ? emptyScriptResult() : absorb(scope, await this.runPostResponse(request, response, scope.values, decision, signal));
      return { prepared, effectiveRequest, response: withScripts(response, preResult, postResult) };
    } finally {
      this.persistVariables(collectionId, scope.changes);
    }
  }

  private async decideScripts(request: RequestModel, collectionId: string | undefined, collectionName: string): Promise<ScriptDecision> {
    return requestHasScripts(request) ? this.permission.check(collectionId, collectionName) : { allowed: true };
  }

  private async currentVariables(requestId: string): Promise<Record<string, string>> {
    const location = this.storage.findRequest(requestId);
    if (!location) {
      return {};
    }
    await this.vault.load([location.collection]);
    return resolveCollectionVariables(this.vault.hydrate(location.collection));
  }

  private runPostResponse(
    request: RequestModel,
    response: ResponseModel,
    variables: Record<string, string>,
    decision: ScriptDecision,
    signal?: AbortSignal,
  ): Promise<ScriptRunResult> {
    const input = { variables, request: toScriptRequest(request), response: toScriptResponse(response) };
    return runPhase(request.scripts?.post ?? '', input, decision, signal);
  }

  private persistVariables(collectionId: string | undefined, changes: Record<string, string>): void {
    if (collectionId) {
      this.storage.writeScriptVariables(collectionId, changes);
    }
  }

  private async sendOptionsFor(collectionId: string | undefined, request: RequestModel, targetUrl: string) {
    const session = collectionId ? await this.cookies.sessionFor(collectionId) : undefined;
    return buildSendOptions(targetUrl, request.timeoutMs, session);
  }
}

function withScripts(response: ResponseModel, preResult: ScriptRunResult, postResult: ScriptRunResult): ResponseModel {
  const phased: Array<{ phase: ScriptPhase; result: ScriptRunResult }> = [
    { phase: 'pre-request', result: preResult },
    { phase: 'post-response', result: postResult },
  ];
  const scripts = mergeScriptResults(phased);
  return hasScriptActivity(scripts) ? { ...response, scripts } : response;
}
