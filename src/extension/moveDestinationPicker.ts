import * as vscode from 'vscode';
import { listFolders } from '../core/collectionTree';
import { CollectionItem, FolderItem, TreeNode } from './collectionsTree';
import { EntryDestination } from './destinationPicker';
import { Storage } from './storage';

export interface MoveDestination extends EntryDestination {
  promote?: boolean;
}

interface MovePick extends vscode.QuickPickItem {
  destination: MoveDestination;
}

function excludedFolderIds(node: TreeNode): Set<string> {
  return node instanceof FolderItem ? new Set([node.folder.id, ...listFolders(node.folder.items).map((folder) => folder.id)]) : new Set();
}

function picksFor(storage: Storage, node: TreeNode): MovePick[] {
  const excludedIds = excludedFolderIds(node);
  const ownCollectionId = node instanceof CollectionItem ? node.collection.id : undefined;
  const collectionPicks = storage
    .getCollections()
    .filter((collection) => collection.id !== ownCollectionId)
    .flatMap((collection) => [
      { label: `$(library) ${collection.name}`, destination: { collectionId: collection.id } },
      ...listFolders(collection.items)
        .filter((folder) => !excludedIds.has(folder.id))
        .map((folder) => ({ label: `$(folder) ${collection.name} / ${folder.path}`, destination: { collectionId: collection.id, folderId: folder.id } })),
    ]);
  const promotePick: MovePick[] = node instanceof FolderItem ? [{ label: '$(add) New top-level collection', destination: { collectionId: '', promote: true } }] : [];
  return [...promotePick, ...collectionPicks];
}

export async function pickMoveDestination(storage: Storage, node: TreeNode): Promise<MoveDestination | undefined> {
  const picks = picksFor(storage, node);
  if (picks.length === 0) {
    vscode.window.showWarningMessage('There is nowhere to move this to.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(picks, { placeHolder: 'Move to…' });
  return pick?.destination;
}
