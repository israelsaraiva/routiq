import * as vscode from 'vscode';
import { RequestSearchEntry, flattenRequests } from '../core/requestSearch';
import { CollectionsTreeProvider } from './collectionsTree';
import { Storage } from './storage';

const FILTERED_CONTEXT_KEY = 'routiq.treeFiltered';

interface RequestPickItem extends vscode.QuickPickItem {
  requestId: string;
}

function toPickItem(entry: RequestSearchEntry): RequestPickItem {
  return { label: entry.name, description: `${entry.method} ${entry.url}`, detail: entry.path, requestId: entry.requestId };
}

export async function pickRequestId(storage: Storage): Promise<string | undefined> {
  const items = flattenRequests(storage.getCollections()).map(toPickItem);
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Search requests by name, method, URL or path',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.requestId;
}

export class TreeFilter {
  constructor(private readonly tree: CollectionsTreeProvider, private readonly treeView: vscode.TreeView<unknown>) {}

  async prompt(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Filter requests by name, method or URL (empty clears the filter)',
      value: this.tree.filter,
    });
    if (query !== undefined) {
      this.apply(query);
    }
  }

  clear(): void {
    this.apply('');
  }

  private apply(query: string): void {
    this.tree.setFilter(query);
    this.treeView.message = this.tree.filter ? `Filter: ${this.tree.filter}` : undefined;
    void vscode.commands.executeCommand('setContext', FILTERED_CONTEXT_KEY, this.tree.filter !== '');
  }
}
