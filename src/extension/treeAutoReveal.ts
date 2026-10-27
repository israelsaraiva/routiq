import * as vscode from 'vscode';
import { CollectionsTreeProvider, RequestItem, TreeNode } from './collectionsTree';

const REVEAL_OPTIONS = { select: true, focus: false, expand: true } as const;

export class TreeAutoReveal {
  constructor(private readonly tree: CollectionsTreeProvider, private readonly treeView: vscode.TreeView<TreeNode>) {}

  get enabled(): boolean {
    return vscode.workspace.getConfiguration('routiq').get<boolean>('autoReveal', true);
  }

  async reveal(requestId: string): Promise<void> {
    const node = this.enabled ? this.tree.requestNode(requestId) : undefined;
    if (node) {
      await this.treeView.reveal(node, REVEAL_OPTIONS).then(undefined, () => undefined);
    }
  }

  async restoreSelection(requestId: string | undefined): Promise<void> {
    if (requestId && this.selectionIsEmptyOrOn(requestId)) {
      await this.reveal(requestId);
    }
  }

  private selectionIsEmptyOrOn(requestId: string): boolean {
    const { selection } = this.treeView;
    return selection.length === 0 || selection.some((node) => node instanceof RequestItem && node.request.id === requestId);
  }
}
