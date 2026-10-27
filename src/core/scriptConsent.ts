import { RequestModel } from '../shared/types';

export type ScriptDecision = { allowed: true } | { allowed: false; reason: string };

export const SCRIPTS_NOT_CONFIRMED_REASON = 'Scripts are disabled until you allow them for this collection';
export const SCRIPTS_UNTRUSTED_WORKSPACE_REASON = 'Scripts are disabled in an untrusted workspace';

export function requestHasScripts(request: RequestModel): boolean {
  return (request.scripts?.pre ?? '').trim() !== '' || (request.scripts?.post ?? '').trim() !== '';
}

export function isCollectionApproved(approvedIds: readonly string[], collectionId: string): boolean {
  return approvedIds.includes(collectionId);
}

export function withApproval(approvedIds: readonly string[], collectionId: string): string[] {
  return isCollectionApproved(approvedIds, collectionId) ? [...approvedIds] : [...approvedIds, collectionId];
}

export function decideScriptExecution(input: { workspaceTrusted: boolean; approved: boolean }): ScriptDecision | 'ask' {
  if (!input.workspaceTrusted) {
    return { allowed: false, reason: SCRIPTS_UNTRUSTED_WORKSPACE_REASON };
  }
  return input.approved ? { allowed: true } : 'ask';
}
