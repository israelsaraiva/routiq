import * as vscode from 'vscode';
import { SCRIPTS_NOT_CONFIRMED_REASON, ScriptDecision, decideScriptExecution, isCollectionApproved, withApproval } from '../core/scriptConsent';

const APPROVED_COLLECTIONS_KEY = 'routiq.scriptApprovedCollections';
const ALLOW_ACTION = 'Allow Scripts';
const KEEP_DISABLED_ACTION = 'Keep Disabled';
const CONSENT_MESSAGE =
  'Routiq: this collection contains scripts. Scripts are JavaScript that runs on your machine when you send requests; ' +
  'a script from an untrusted or imported collection can read the variables and responses it is given and make your requests misbehave. ' +
  'Only allow scripts from sources you trust.';

export interface ScriptPermission {
  check(collectionId: string | undefined, collectionName: string): Promise<ScriptDecision>;
}

export class ScriptConsent implements ScriptPermission {
  private readonly pending = new Map<string, Promise<boolean>>();

  constructor(private readonly state: vscode.Memento) {}

  async check(collectionId: string | undefined, collectionName: string): Promise<ScriptDecision> {
    const approved = collectionId !== undefined && isCollectionApproved(this.approvedIds(), collectionId);
    const decision = decideScriptExecution({ workspaceTrusted: vscode.workspace.isTrusted, approved });
    if (decision !== 'ask') {
      return decision;
    }
    const granted = collectionId !== undefined && (await this.askOnce(collectionId, collectionName));
    return granted ? { allowed: true } : { allowed: false, reason: SCRIPTS_NOT_CONFIRMED_REASON };
  }

  private approvedIds(): string[] {
    return this.state.get<string[]>(APPROVED_COLLECTIONS_KEY, []);
  }

  private askOnce(collectionId: string, collectionName: string): Promise<boolean> {
    const existing = this.pending.get(collectionId);
    if (existing) {
      return existing;
    }
    const asking = this.ask(collectionId, collectionName).finally(() => this.pending.delete(collectionId));
    this.pending.set(collectionId, asking);
    return asking;
  }

  private async ask(collectionId: string, collectionName: string): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
      `${CONSENT_MESSAGE}\n\nCollection: ${collectionName}`,
      { modal: true },
      ALLOW_ACTION,
      KEEP_DISABLED_ACTION,
    );
    if (choice !== ALLOW_ACTION) {
      return false;
    }
    await this.state.update(APPROVED_COLLECTIONS_KEY, withApproval(this.approvedIds(), collectionId));
    return true;
  }
}
