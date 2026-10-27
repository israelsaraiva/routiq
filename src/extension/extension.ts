import * as vscode from 'vscode';
import { CollectionRunner } from './collectionRunner';
import { ScriptConsent } from './scriptConsent';
import { CollectionItem, CollectionsTreeProvider, FolderItem, RequestItem, TreeNode } from './collectionsTree';
import { CookieStore } from './cookieStore';
import { manageCookies } from './cookieCommands';
import { copyStoredRequestAsCurl } from './curlCommands';
import { collectionIdFromNode, pickCollectionId, pickDestination } from './destinationPicker';
import { EnvironmentPanels } from './environmentPanels';
import { EnvironmentStatusBar, switchEnvironment } from './environmentSwitcher';
import { chooseImportSource, exportCollectionAsPostman, exportCollections, importCurl, importFromClipboard } from './importExport';
import { InfoPanels } from './infoPanels';
import { HistoryStore } from './historyStore';
import { GraphqlSchemaStore } from './graphqlSchemaStore';
import { pickRequestKind } from './requestKindPicker';
import { RequestPanels } from './requestPanels';
import { TreeFilter, pickRequestId } from './requestSearch';
import { TreeAutoReveal } from './treeAutoReveal';
import { SecretVault } from './secretVault';
import { Storage } from './storage';

async function askName(prompt: string, value?: string): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({ prompt, value, validateInput: (v) => (v.trim() ? undefined : 'Name is required') });
  return name?.trim();
}

async function confirmDelete(label: string): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(`Delete "${label}"?`, { modal: true }, 'Delete');
  return answer === 'Delete';
}

interface Services {
  storage: Storage;
  panels: RequestPanels;
  environmentPanels: EnvironmentPanels;
  statusBar: EnvironmentStatusBar;
  vault: SecretVault;
}

function registerEntryCommands(register: Registrar, { storage, panels }: Services): void {
  register('routiq.newCollection', async () => {
    const name = await askName('Collection name');
    if (name) {
      storage.addCollection(name);
    }
  });

  register('routiq.newRequest', async (node) => {
    const destination = await pickDestination(storage, node);
    const kind = destination && (await pickRequestKind());
    const name = kind && (await askName('Request name'));
    if (!destination || !kind || !name) {
      return;
    }
    const request = storage.addRequest(destination.collectionId, name, destination.folderId, kind);
    if (request) {
      panels.open(request.id);
    }
  });

  register('routiq.newFolder', async (node) => {
    const destination = await pickDestination(storage, node);
    const name = destination && (await askName('Folder name'));
    if (destination && name) {
      storage.addFolder(destination.collectionId, name, destination.folderId);
    }
  });

  register('routiq.rename', async (node) => {
    if (node instanceof CollectionItem) {
      const name = await askName('New collection name', node.collection.name);
      name && storage.renameCollection(node.collection.id, name);
    } else if (node instanceof FolderItem) {
      const name = await askName('New folder name', node.folder.name);
      name && storage.renameEntry(node.folder.id, name);
    } else if (node instanceof RequestItem) {
      const name = await askName('New request name', node.request.name);
      name && storage.renameEntry(node.request.id, name);
    }
  });

  register('routiq.delete', async (node) => {
    if (node instanceof CollectionItem && (await confirmDelete(node.collection.name))) {
      storage.deleteCollection(node.collection.id);
    } else if (node instanceof FolderItem && (await confirmDelete(`${node.folder.name}" and everything in it`))) {
      storage.deleteEntry(node.folder.id);
    } else if (node instanceof RequestItem && (await confirmDelete(node.request.name))) {
      storage.deleteEntry(node.request.id);
    }
  });

  register('routiq.duplicate', (node) => {
    if (node instanceof CollectionItem) {
      storage.duplicateCollection(node.collection.id);
    } else if (node instanceof FolderItem) {
      storage.duplicateEntry(node.folder.id);
    } else if (node instanceof RequestItem) {
      storage.duplicateEntry(node.request.id);
    }
  });

  register('routiq.openRequest', (node) => {
    if (node instanceof RequestItem) {
      panels.open(node.request.id);
    }
  });
}

function registerImportExportCommands(register: Registrar, { storage, panels, vault }: Services): void {
  const openRequest = (requestId: string) => panels.open(requestId);

  register('routiq.import', (node) => chooseImportSource(storage, vault, openRequest, node));
  register('routiq.importFromClipboard', (node) => importFromClipboard(storage, vault, openRequest, node));
  register('routiq.importCurl', (node) => importCurl(storage, openRequest, node));

  register('routiq.export', (node) => {
    if (node instanceof CollectionItem) {
      return exportCollections([node.collection], node.collection.name);
    }
    return exportCollections(storage.getCollections(), 'routiq-collections');
  });

  register('routiq.exportPostman', async (node) => {
    const collectionId = await pickCollectionId(storage, node);
    const collection = collectionId ? storage.getCollection(collectionId) : undefined;
    if (collection) {
      await exportCollectionAsPostman(collection);
    }
  });

  register('routiq.copyAsCurl', (node) => {
    if (node instanceof RequestItem) {
      return copyStoredRequestAsCurl(storage, vault, node.request.id);
    }
  });
}

function registerEnvironmentCommands(register: Registrar, { storage, environmentPanels, statusBar }: Services): void {
  register<CollectionTarget>('routiq.manageEnvironments', async (target) => {
    const collectionId = typeof target === 'string' ? target : await pickCollectionId(storage, target);
    if (collectionId) {
      environmentPanels.open(collectionId);
    }
  });

  register<CollectionTarget>('routiq.switchEnvironment', async (target) => {
    const collectionId =
      typeof target === 'string' ? target : (collectionIdFromNode(target) ?? statusBar.currentCollectionId ?? (await pickCollectionId(storage)));
    if (collectionId) {
      await switchEnvironment(storage, collectionId);
    }
  });
}

type Registrar = <Target = TreeNode>(command: string, handler: (target?: Target) => unknown) => void;
type CollectionTarget = TreeNode | string;

function createRegistrar(context: vscode.ExtensionContext): Registrar {
  return (command, handler) => context.subscriptions.push(vscode.commands.registerCommand(command, handler));
}

export interface RoutiqExtensionApi {
  storage: Storage;
  panels: RequestPanels;
  treeView: vscode.TreeView<TreeNode>;
}

export async function activate(context: vscode.ExtensionContext): Promise<RoutiqExtensionApi> {
  const storage = new Storage(context.globalStorageUri.fsPath);
  await storage.init();
  const cookieStore = new CookieStore(context.globalStorageUri.fsPath);
  const historyStore = new HistoryStore(context.globalStorageUri.fsPath);
  const vault = new SecretVault(context.secrets);
  await vault.load(storage.getCollections());
  const scriptConsent = new ScriptConsent(context.globalState);
  const panels = new RequestPanels(context.extensionUri, storage, historyStore, cookieStore, vault, new GraphqlSchemaStore(context.globalStorageUri.fsPath), scriptConsent);
  const environmentPanels = new EnvironmentPanels(context.extensionUri, storage, vault);
  const statusBar = new EnvironmentStatusBar(storage);
  const infoPanels = new InfoPanels(context.extension, storage);
  const tree = new CollectionsTreeProvider(storage);
  const treeView = vscode.window.createTreeView('routiq.collections', {
    treeDataProvider: tree,
    dragAndDropController: tree,
    canSelectMany: true,
  });

  const autoReveal = new TreeAutoReveal(tree, treeView);

  context.subscriptions.push(
    storage,
    vault,
    panels,
    environmentPanels,
    infoPanels,
    statusBar,
    treeView,
    storage.onDidDeleteRequests((requestIds) => void Promise.all(requestIds.map((requestId) => historyStore.clear(requestId))).catch(() => undefined)),
    storage.onDidDeleteCollection((collectionId) => void cookieStore.discard(collectionId).catch(() => undefined)),
    storage.onDidDeleteCollection((collectionId) => void vault.discardCollection(collectionId).catch(() => undefined)),
    storage.onDidChange(() => void vault.load(storage.getCollections()).catch(() => undefined)),
    panels.onDidFocusCollection((collectionId) => statusBar.focusCollection(collectionId)),
    panels.onDidFocusRequest((requestId) => void autoReveal.reveal(requestId)),
    storage.onDidChange(() => void autoReveal.restoreSelection(panels.activeRequestId)),
    treeView.onDidChangeSelection(({ selection }) => focusSelectedCollection(selection, statusBar)),
  );

  const services: Services = { storage, panels, environmentPanels, statusBar, vault };
  const register = createRegistrar(context);
  registerEntryCommands(register, services);
  registerImportExportCommands(register, services);
  registerEnvironmentCommands(register, services);
  const treeFilter = new TreeFilter(tree, treeView);
  register('routiq.searchRequests', async () => {
    const requestId = await pickRequestId(storage);
    if (requestId) {
      panels.open(requestId);
    }
  });
  register('routiq.openHelp', () => infoPanels.open('help'));
  register('routiq.openAbout', () => infoPanels.open('about'));
  register('routiq.filterTree', () => treeFilter.prompt());
  register('routiq.clearTreeFilter', () => treeFilter.clear());
  const runner = new CollectionRunner(context.extensionUri, storage, cookieStore, vault, scriptConsent);
  register('routiq.runCollection', async (node) => {
    if (node instanceof FolderItem) {
      return runner.run(node.collectionId, node.folder.id);
    }
    const collectionId = await pickCollectionId(storage, node);
    return collectionId && runner.run(collectionId);
  });
  register('routiq.manageCookies', (node) => manageCookies(storage, cookieStore, node));
  register('routiq.clearHistory', async () => {
    const answer = await vscode.window.showWarningMessage('Clear all request history?', { modal: true }, 'Clear');
    if (answer === 'Clear') {
      await panels.clearAllHistory();
    }
  });
  return { storage, panels, treeView };
}

function focusSelectedCollection(selection: readonly TreeNode[], statusBar: EnvironmentStatusBar): void {
  const collectionId = collectionIdFromNode(selection[0]);
  if (collectionId) {
    statusBar.focusCollection(collectionId);
  }
}

export function deactivate(): void {}
