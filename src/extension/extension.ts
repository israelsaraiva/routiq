import * as vscode from 'vscode';
import { CollectionRunner } from './collectionRunner';
import { ScriptConsent } from './scriptConsent';
import { CollectionItem, CollectionsTreeProvider, FolderItem, RequestItem, TreeNode } from './collectionsTree';
import { CollectionRestructurer } from './restructurer';
import { CookieStore } from './cookieStore';
import { manageCookies } from './cookieCommands';
import { copyStoredRequestAsCurl } from './curlCommands';
import { collectionIdFromNode, pickCollectionId, pickDestination } from './destinationPicker';
import { EntrySortMode } from '../core/entrySorting';
import { pickMoveDestination } from './moveDestinationPicker';
import { EnvironmentPanels } from './environmentPanels';
import { EnvironmentStatusBar, switchEnvironment } from './environmentSwitcher';
import { chooseImportSource, exportCollectionAsPostman, exportCollections, importCurl, importFromClipboard } from './importExport';
import { InfoPanels } from './infoPanels';
import { createKafkaClient } from './kafkaClient';
import { KafkaMessageHistory } from './kafkaMessageHistory';
import { KafkaMessageSettingsStore } from './kafkaMessageSettings';
import { KafkaPanels } from './kafkaPanels';
import { KafkaProfileStore } from './kafkaProfileStore';
import { KafkaTemplateStore } from './kafkaTemplateStore';
import { KafkaProfileItem, KafkaTreeProvider } from './kafkaTree';
import { HistoryStore } from './historyStore';
import { GraphqlSchemaStore } from './graphqlSchemaStore';
import { pickRequestKind } from './requestKindPicker';
import { convertStoredRequest } from './requestConversionCommands';
import { RequestPanels } from './requestPanels';
import { TreeFilter, pickRequestId } from './requestSearch';
import { TreeAutoReveal } from './treeAutoReveal';
import { configureOAuth } from './oauthTokens';
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
  restructurer: CollectionRestructurer;
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

function sortNode(storage: Storage, node: unknown, mode: EntrySortMode, recursive: boolean): void {
  if (node instanceof CollectionItem) {
    storage.sortEntries(node.collection.id, undefined, mode, recursive);
  } else if (node instanceof FolderItem) {
    storage.sortEntries(node.collectionId, node.folder.id, mode, recursive);
  }
}

function registerSortCommands(register: Registrar, { storage }: Services): void {
  register('routiq.sortAscending', (node) => sortNode(storage, node, 'name-asc', false));
  register('routiq.sortDescending', (node) => sortNode(storage, node, 'name-desc', false));
  register('routiq.sortByMethod', (node) => sortNode(storage, node, 'method', false));
  register('routiq.sortAscendingRecursive', (node) => sortNode(storage, node, 'name-asc', true));
  register('routiq.sortDescendingRecursive', (node) => sortNode(storage, node, 'name-desc', true));
  register('routiq.sortByMethodRecursive', (node) => sortNode(storage, node, 'method', true));
  register('routiq.sortCollectionsAscending', () => storage.sortCollections('asc'));
  register('routiq.sortCollectionsDescending', () => storage.sortCollections('desc'));
}

function registerMoveCommands(register: Registrar, { storage, restructurer }: Services): void {
  register('routiq.moveTo', async (node) => {
    if (node instanceof CollectionItem) {
      const destination = await pickMoveDestination(storage, node);
      destination && !destination.promote && (await restructurer.nestCollection(node.collection.id, destination));
    } else if (node instanceof FolderItem || node instanceof RequestItem) {
      const entryId = node instanceof FolderItem ? node.folder.id : node.request.id;
      const destination = await pickMoveDestination(storage, node);
      if (destination?.promote) {
        restructurer.promoteFolder(entryId);
      } else if (destination) {
        storage.moveEntry(entryId, destination);
      }
    }
  });

  register('routiq.promoteFolder', (node) => {
    node instanceof FolderItem && restructurer.promoteFolder(node.folder.id);
  });

  register('routiq.moveCollectionUp', (node) => {
    if (node instanceof CollectionItem) {
      const collections = storage.getCollections();
      const index = collections.findIndex((collection) => collection.id === node.collection.id);
      index > 0 && storage.moveCollection(node.collection.id, collections[index - 1].id);
    }
  });

  register('routiq.moveCollectionDown', (node) => {
    if (node instanceof CollectionItem) {
      const collections = storage.getCollections();
      const index = collections.findIndex((collection) => collection.id === node.collection.id);
      index !== -1 && index < collections.length - 1 && storage.moveCollection(node.collection.id, collections[index + 2]?.id);
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

  register('routiq.convertToGraphql', (node) => node instanceof RequestItem && convertStoredRequest(storage, node.request.id, 'graphql'));

  register('routiq.convertToHttp', (node) => node instanceof RequestItem && convertStoredRequest(storage, node.request.id, 'http'));
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

function registerKafkaCommands(register: Registrar, profiles: KafkaProfileStore, kafkaPanels: KafkaPanels, history: KafkaMessageHistory): void {
  const profileIdOf = (target?: unknown) => (target instanceof KafkaProfileItem ? target.profile.id : undefined);
  const askName = (value?: string) => vscode.window.showInputBox({ prompt: 'Connection name', value, validateInput: (input) => (input.trim() ? undefined : 'Name is required') });
  register<unknown>('routiq.openKafka', () => kafkaPanels.openProfile());
  register<unknown>('routiq.newKafkaConnection', async () => {
    const name = await askName('New Connection');
    name && (await kafkaPanels.openNewConnection(name.trim()));
  });
  register<unknown>('routiq.openKafkaConnection', (target) => kafkaPanels.openProfile(profileIdOf(target)));
  register<unknown>('routiq.duplicateKafkaConnection', async (target) => {
    const profileId = profileIdOf(target);
    profileId && (await profiles.duplicate(profileId));
  });
  register<unknown>('routiq.renameKafkaConnection', async (target) => {
    const profileId = profileIdOf(target);
    const name = profileId && (await askName(profiles.get(profileId)?.name));
    profileId && name && (await profiles.rename(profileId, name.trim()));
  });
  register<unknown>('routiq.deleteKafkaConnection', async (target) => {
    const profileId = profileIdOf(target);
    const answer = profileId && (await vscode.window.showWarningMessage('Delete this Kafka connection?', { modal: true }, 'Delete'));
    if (profileId && answer === 'Delete') {
      await profiles.remove(profileId);
      await history.saveMessages(profileId, [], 0);
    }
  });
}

function createRegistrar(context: vscode.ExtensionContext): Registrar {
  return (command, handler) => context.subscriptions.push(vscode.commands.registerCommand(command, handler));
}

export interface RoutiqExtensionApi {
  storage: Storage;
  panels: RequestPanels;
  treeView: vscode.TreeView<TreeNode>;
  kafkaPanels: KafkaPanels;
  kafkaProfiles: KafkaProfileStore;
  kafkaTree: KafkaTreeProvider;
}

export async function activate(context: vscode.ExtensionContext): Promise<RoutiqExtensionApi> {
  const storage = new Storage(context.globalStorageUri.fsPath);
  await storage.init();
  const cookieStore = new CookieStore(context.globalStorageUri.fsPath);
  const historyStore = new HistoryStore(context.globalStorageUri.fsPath);
  const vault = new SecretVault(context.secrets);
  configureOAuth({ openBrowser: (url) => vscode.env.openExternal(vscode.Uri.parse(url)), tokenStore: context.secrets });
  context.subscriptions.push({ dispose: () => configureOAuth(undefined) });
  await vault.load(storage.getCollections());
  const scriptConsent = new ScriptConsent(context.globalState);
  const panels = new RequestPanels(context.extensionUri, storage, historyStore, cookieStore, vault, new GraphqlSchemaStore(context.globalStorageUri.fsPath), scriptConsent);
  const environmentPanels = new EnvironmentPanels(context.extensionUri, storage, vault);
  const statusBar = new EnvironmentStatusBar(storage);
  const infoPanels = new InfoPanels(context.extension, storage);
  const restructurer = new CollectionRestructurer(storage, vault);
  const tree = new CollectionsTreeProvider(storage, restructurer);
  const treeView = vscode.window.createTreeView('routiq.collections', {
    treeDataProvider: tree,
    dragAndDropController: tree,
    canSelectMany: true,
  });

  const kafkaProfiles = new KafkaProfileStore(context.globalState, context.secrets);
  const kafkaHistory = new KafkaMessageHistory(context.globalState);
  const kafkaPanels = new KafkaPanels({ extensionUri: context.extensionUri, storage, vault, profiles: kafkaProfiles, history: kafkaHistory, templates: new KafkaTemplateStore(context.globalState), messageSettings: new KafkaMessageSettingsStore(context.globalState, context.secrets), clientFactory: createKafkaClient });
  const kafkaTree = new KafkaTreeProvider(kafkaProfiles);
  const kafkaView = vscode.window.createTreeView('routiq.kafka', { treeDataProvider: kafkaTree });

  const autoReveal = new TreeAutoReveal(tree, treeView);

  context.subscriptions.push(
    storage,
    vault,
    panels,
    environmentPanels,
    infoPanels,
    kafkaProfiles,
    kafkaPanels,
    kafkaView,
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

  const services: Services = { storage, panels, environmentPanels, statusBar, vault, restructurer };
  const register = createRegistrar(context);
  registerEntryCommands(register, services);
  registerSortCommands(register, services);
  registerMoveCommands(register, services);
  registerImportExportCommands(register, services);
  registerEnvironmentCommands(register, services);
  registerKafkaCommands(register, kafkaProfiles, kafkaPanels, kafkaHistory);
  const treeFilter = new TreeFilter(tree, treeView);
  register('routiq.searchRequests', async () => {
    const requestId = await pickRequestId(storage);
    if (requestId) {
      panels.open(requestId);
    }
  });
  register('routiq.diagnoseNetwork', () => panels.diagnoseActiveRequest());
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
  return { storage, panels, treeView, kafkaPanels, kafkaProfiles, kafkaTree };
}

function focusSelectedCollection(selection: readonly TreeNode[], statusBar: EnvironmentStatusBar): void {
  const collectionId = collectionIdFromNode(selection[0]);
  if (collectionId) {
    statusBar.focusCollection(collectionId);
  }
}

export function deactivate(): void {}
