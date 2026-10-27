import * as vscode from 'vscode';
import { listFolders } from '../core/collectionTree';
import { CollectionItem, FolderItem, RequestItem, TreeNode } from './collectionsTree';
import { Storage } from './storage';

export interface EntryDestination {
  collectionId: string;
  folderId?: string;
}

const COLLECTION_ROOT_LABEL = '$(library) Collection root';

export function destinationFromNode(node?: TreeNode): EntryDestination | undefined {
  if (node instanceof CollectionItem) {
    return { collectionId: node.collection.id };
  }
  if (node instanceof FolderItem) {
    return { collectionId: node.collectionId, folderId: node.folder.id };
  }
  return undefined;
}

export function collectionIdFromNode(node?: TreeNode): string | undefined {
  if (node instanceof CollectionItem) {
    return node.collection.id;
  }
  return node instanceof FolderItem || node instanceof RequestItem ? node.collectionId : undefined;
}

export async function pickCollectionId(storage: Storage, node?: TreeNode): Promise<string | undefined> {
  const fromNode = collectionIdFromNode(node);
  if (fromNode) {
    return fromNode;
  }
  const collections = storage.getCollections();
  if (collections.length === 0) {
    vscode.window.showWarningMessage('Create a collection first.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    collections.map((collection) => ({ label: collection.name, id: collection.id })),
    { placeHolder: 'Select a collection' },
  );
  return pick?.id;
}

async function pickFolderId(storage: Storage, collectionId: string): Promise<{ folderId?: string } | undefined> {
  const folders = listFolders(storage.getCollection(collectionId)?.items ?? []);
  if (folders.length === 0) {
    return {};
  }
  const pick = await vscode.window.showQuickPick(
    [{ label: COLLECTION_ROOT_LABEL, folderId: undefined as string | undefined }, ...folders.map((folder) => ({ label: `$(folder) ${folder.path}`, folderId: folder.id as string | undefined }))],
    { placeHolder: 'Select a folder' },
  );
  return pick && { folderId: pick.folderId };
}

export async function pickDestination(storage: Storage, node?: TreeNode): Promise<EntryDestination | undefined> {
  const fromNode = destinationFromNode(node);
  if (fromNode) {
    return fromNode;
  }
  const collectionId = await pickCollectionId(storage, node);
  if (!collectionId) {
    return undefined;
  }
  const folder = await pickFolderId(storage, collectionId);
  return folder && { collectionId, folderId: folder.folderId };
}
