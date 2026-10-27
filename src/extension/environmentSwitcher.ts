import * as vscode from 'vscode';
import { findActiveEnvironment } from '../core/environments';
import { Collection } from '../shared/types';
import { Storage } from './storage';

const NO_ENVIRONMENT_LABEL = 'No environment (base variables only)';
const MANAGE_LABEL = '$(gear) Manage environments…';

interface EnvironmentPick extends vscode.QuickPickItem {
  environmentId?: string;
  manage?: boolean;
}

function describeActive(collection: Collection): string {
  return findActiveEnvironment(collection)?.name ?? 'No environment';
}

function buildPicks(collection: Collection): EnvironmentPick[] {
  const active = collection.activeEnvironmentId;
  return [
    { label: NO_ENVIRONMENT_LABEL, picked: !active },
    ...collection.environments.map((environment) => ({
      label: environment.name,
      description: environment.id === active ? 'active' : undefined,
      environmentId: environment.id,
    })),
    { label: MANAGE_LABEL, manage: true },
  ];
}

export async function switchEnvironment(storage: Storage, collectionId: string): Promise<void> {
  const collection = storage.getCollection(collectionId);
  if (!collection) {
    return;
  }
  const pick = await vscode.window.showQuickPick(buildPicks(collection), { title: `Environment — ${collection.name}` });
  if (pick?.manage) {
    await vscode.commands.executeCommand('routiq.manageEnvironments', collectionId);
  } else if (pick) {
    storage.setActiveEnvironment(collectionId, pick.environmentId);
  }
}

export class EnvironmentStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  private focusedCollectionId: string | undefined;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly storage: Storage) {
    this.item.command = 'routiq.switchEnvironment';
    this.subscription = storage.onDidChange(() => this.refresh());
    this.refresh();
  }

  focusCollection(collectionId: string): void {
    this.focusedCollectionId = collectionId;
    this.refresh();
  }

  get currentCollectionId(): string | undefined {
    return this.currentCollection()?.id;
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }

  private currentCollection(): Collection | undefined {
    return this.storage.getCollection(this.focusedCollectionId ?? '') ?? this.storage.getCollections()[0];
  }

  private refresh(): void {
    const collection = this.currentCollection();
    if (!collection) {
      this.item.hide();
      return;
    }
    this.item.text = `$(server-environment) ${describeActive(collection)}`;
    this.item.tooltip = `Routiq environment for "${collection.name}" — click to switch`;
    this.item.show();
  }
}
