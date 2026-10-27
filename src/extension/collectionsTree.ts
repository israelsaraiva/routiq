import * as vscode from 'vscode';
import { countRequests, findFolder, findParentFolderId, findRequest, isFolder, locateEntry, Destination } from '../core/collectionTree';
import { NestDestination } from '../core/restructure';
import { destinationOnEntry } from '../core/dropPlacement';
import { filterEntries } from '../core/requestSearch';
import { Collection, CollectionEntry, FolderModel, RequestModel } from '../shared/types';
import { describeRequest, requestKindOf } from '../core/requestKinds';
import { CollectionRestructurer } from './restructurer';
import { Storage } from './storage';

const TREE_MIME_TYPE = 'application/vnd.code.tree.routiq.collections';

const METHOD_ICON = 'circle-filled';

const METHOD_COLOR_IDS: Record<string, string> = {
  GET: 'charts.green',
  POST: 'charts.orange',
  PUT: 'charts.blue',
  PATCH: 'charts.purple',
  DELETE: 'charts.red',
};

function methodColorId(method: string): string {
  return METHOD_COLOR_IDS[method] ?? 'charts.yellow';
}

function requestTooltip(request: RequestModel): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**${request.name.replace(/[\\`*_{}[\]()#+!|<>-]/g, '\\$&')}**\n\n`);
  tooltip.appendMarkdown(`\`${request.method}\``);
  if (request.url) {
    tooltip.appendMarkdown(` \`${request.url.replace(/`/g, "'")}\``);
  }
  return tooltip;
}

export class CollectionItem extends vscode.TreeItem {
  constructor(readonly collection: Collection, filtered = false) {
    super(collection.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'collection';
    this.id = `collection:${collection.id}${filtered ? ':filtered' : ''}`;
    this.description = `${countRequests(collection.items)}`;
    this.iconPath = new vscode.ThemeIcon('library');
  }
}

export class FolderItem extends vscode.TreeItem {
  constructor(readonly collectionId: string, readonly folder: FolderModel, filtered = false) {
    super(folder.name, filtered ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'folder';
    this.id = `folder:${folder.id}${filtered ? ':filtered' : ''}`;
    this.description = `${countRequests(folder.items)}`;
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

const REQUEST_KIND_ICONS = { http: 'symbol-event', sse: 'broadcast', websocket: 'plug', grpc: 'server-process', graphql: 'type-hierarchy' } as const;

function requestIcon(request: RequestModel): vscode.ThemeIcon {
  const kind = requestKindOf(request);
  return kind === 'http'
    ? new vscode.ThemeIcon(METHOD_ICON, new vscode.ThemeColor(methodColorId(request.method)))
    : new vscode.ThemeIcon(REQUEST_KIND_ICONS[kind]);
}

export class RequestItem extends vscode.TreeItem {
  constructor(readonly collectionId: string, readonly request: RequestModel) {
    super(request.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'request';
    this.id = `request:${request.id}`;
    this.description = describeRequest(request);
    this.iconPath = requestIcon(request);
    this.tooltip = requestTooltip(request);
    this.command = { command: 'routiq.openRequest', title: 'Open Request', arguments: [this] };
  }
}

export type TreeNode = CollectionItem | FolderItem | RequestItem;
interface DragPayload {
  collectionIds: string[];
  entryIds: string[];
}

type MovableNode = FolderItem | RequestItem;

function isMovable(node: TreeNode): node is MovableNode {
  return node instanceof FolderItem || node instanceof RequestItem;
}

function entryIdOf(node: MovableNode): string {
  return node instanceof FolderItem ? node.folder.id : node.request.id;
}

function toNode(collectionId: string, entry: CollectionEntry, filtered: boolean): TreeNode {
  return isFolder(entry) ? new FolderItem(collectionId, entry, filtered) : new RequestItem(collectionId, entry);
}

export class CollectionsTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.TreeDragAndDropController<TreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  readonly dragMimeTypes = [TREE_MIME_TYPE];
  readonly dropMimeTypes = [TREE_MIME_TYPE];

  private filterQuery = '';

  constructor(private readonly storage: Storage, private readonly restructurer: CollectionRestructurer) {
    storage.onDidChange(() => this.changeEmitter.fire());
  }

  get filter(): string {
    return this.filterQuery;
  }

  setFilter(query: string): void {
    this.filterQuery = query.trim();
    this.changeEmitter.fire();
  }

  private visibleItems(items: CollectionEntry[]): CollectionEntry[] {
    return filterEntries(items, this.filterQuery);
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    return node;
  }

  getParent(node: TreeNode): TreeNode | undefined {
    if (node instanceof CollectionItem) {
      return undefined;
    }
    const collection = this.storage.getCollection(node.collectionId);
    if (!collection) {
      return undefined;
    }
    const filtered = this.filterQuery !== '';
    const visible = this.visibleItems(collection.items);
    const parentFolder = findFolder(visible, findParentFolderId(visible, entryIdOf(node)) ?? '');
    return parentFolder ? new FolderItem(collection.id, parentFolder, filtered) : new CollectionItem(collection, filtered);
  }

  requestNode(requestId: string): RequestItem | undefined {
    const location = locateEntry(this.storage.getCollections(), requestId);
    const collection = location && this.storage.getCollection(location.collectionId);
    const request = collection && findRequest(this.visibleItems(collection.items), requestId);
    return collection && request ? new RequestItem(collection.id, request) : undefined;
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (!node) {
      return this.storage
        .getCollections()
        .filter((collection) => this.filterQuery === '' || this.visibleItems(collection.items).length > 0)
        .map((collection) => new CollectionItem(collection, this.filterQuery !== ''));
    }
    if (node instanceof CollectionItem) {
      const collection = this.storage.getCollection(node.collection.id);
      return this.visibleItems(collection?.items ?? []).map((entry) => toNode(collection!.id, entry, this.filterQuery !== ''));
    }
    if (node instanceof FolderItem) {
      const location = this.storage.findFolder(node.folder.id);
      const items = this.filterQuery === '' ? (location?.folder.items ?? []) : node.folder.items;
      return items.map((entry) => toNode(location!.collection.id, entry, this.filterQuery !== ''));
    }
    return [];
  }

  handleDrag(source: readonly TreeNode[], dataTransfer: vscode.DataTransfer): void {
    const collectionIds = source.filter((node): node is CollectionItem => node instanceof CollectionItem).map((node) => node.collection.id);
    const entryIds = source.filter(isMovable).map(entryIdOf);
    const payload: DragPayload = collectionIds.length > 0 ? { collectionIds, entryIds: [] } : { collectionIds: [], entryIds };
    if (payload.collectionIds.length > 0 || payload.entryIds.length > 0) {
      dataTransfer.set(TREE_MIME_TYPE, new vscode.DataTransferItem(payload));
    }
  }

  handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer): void {
    const payload = dataTransfer.get(TREE_MIME_TYPE)?.value as Partial<DragPayload> | undefined;
    if (Array.isArray(payload?.collectionIds) && payload.collectionIds.length > 0) {
      this.dropCollections(payload.collectionIds.map(String), target);
    } else if (Array.isArray(payload?.entryIds)) {
      this.dropEntries(payload.entryIds.map(String), target);
    }
  }

  private dropCollections(collectionIds: string[], target: TreeNode | undefined): void {
    if (!target) {
      collectionIds.forEach((collectionId) => this.storage.moveCollection(collectionId));
      return;
    }
    const destination = target instanceof RequestItem ? undefined : this.nestDestination(target);
    destination && void this.nestSequentially(collectionIds, destination);
  }

  private async nestSequentially(collectionIds: string[], destination: NestDestination): Promise<void> {
    for (const collectionId of collectionIds) {
      await this.restructurer.nestCollection(collectionId, destination);
    }
  }

  private nestDestination(target: CollectionItem | FolderItem): NestDestination {
    return target instanceof CollectionItem ? { collectionId: target.collection.id } : { collectionId: target.collectionId, folderId: target.folder.id };
  }

  private dropEntries(entryIds: string[], target: TreeNode | undefined): void {
    if (!target) {
      entryIds.filter((entryId) => this.storage.findFolder(entryId)).forEach((folderId) => this.restructurer.promoteFolder(folderId));
      return;
    }
    const collections = this.storage.getCollections();
    const destinations = entryIds.map((entryId) => ({ entryId, destination: this.destinationFor(collections, entryId, target) }));
    for (const { entryId, destination } of destinations) {
      destination && this.storage.moveEntry(entryId, destination);
    }
  }

  private destinationFor(collections: Collection[], entryId: string, target: TreeNode): Destination | undefined {
    if (target instanceof CollectionItem) {
      return { collectionId: target.collection.id };
    }
    return destinationOnEntry(collections, entryId, target instanceof FolderItem ? target.folder : target.request);
  }
}
