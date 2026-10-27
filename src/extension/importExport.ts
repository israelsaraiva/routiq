import * as vscode from 'vscode';
import { convertForeignFormat } from '../core/foreignImport';
import { ImportDetection, detectImportFormat } from '../core/importDetection';
import { ImportSummary, formatEnvironmentImportMessage, formatSummaryDetails, formatSummaryMessage, summarizeImport } from '../core/importReport';
import { importPostmanEnvironment, withAddedEnvironment } from '../core/postmanEnvironment';
import { stripDraftSecrets } from '../core/secrets';
import { buildExportFile, parseImportedCollections } from '../core/postman';
import { buildPostmanEnvironment, buildPostmanExport } from '../core/postmanExport';
import { Collection, RequestModel } from '../shared/types';
import { importCurlCommand } from './curlCommands';
import { pickCollectionId, pickDestination } from './destinationPicker';
import { SecretVault } from './secretVault';
import { TreeNode } from './collectionsTree';
import { Storage } from './storage';

const JSON_FILTERS = { JSON: ['json'] };
const IMPORT_FILTERS = { 'JSON / YAML': ['json', 'yaml', 'yml'] };
const FROM_FILE_LABEL = '$(file) From file…';
const FROM_CLIPBOARD_LABEL = '$(clippy) From clipboard';
const CURL_LABEL = '$(terminal) cURL command…';
const USE_CLIPBOARD_LABEL = '$(clippy) Use the cURL command on the clipboard';
const TYPE_CURL_LABEL = '$(edit) Type or paste a cURL command';

export async function exportCollections(collections: Collection[], suggestedName: string): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${suggestedName}.json`),
    filters: JSON_FILTERS,
  });
  if (!target) {
    return;
  }
  const content = JSON.stringify(buildExportFile(collections), null, 2);
  await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
  vscode.window.showInformationMessage(`Exported ${collections.length} collection(s) to ${target.fsPath}`);
}

function environmentFileFor(collectionFile: vscode.Uri, environmentName: string): vscode.Uri {
  const directory = vscode.Uri.joinPath(collectionFile, '..');
  const safeName = environmentName.replace(/[^\w.-]+/g, '_');
  return vscode.Uri.joinPath(directory, `${safeName}.postman_environment.json`);
}

async function writeJson(target: vscode.Uri, value: unknown): Promise<void> {
  await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(value, null, 2), 'utf8'));
}

async function writePostmanEnvironments(collection: Collection, collectionFile: vscode.Uri): Promise<void> {
  for (const environment of collection.environments) {
    await writeJson(environmentFileFor(collectionFile, environment.name), buildPostmanEnvironment(environment));
  }
}

export async function exportCollectionAsPostman(collection: Collection): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${collection.name}.postman_collection.json`),
    filters: JSON_FILTERS,
  });
  if (!target) {
    return;
  }
  await writeJson(target, buildPostmanExport(collection));
  await writePostmanEnvironments(collection, target);
  const environmentNote = collection.environments.length > 0 ? ` with ${collection.environments.length} environment file(s)` : '';
  vscode.window.showInformationMessage(`Exported "${collection.name}" as Postman v2.1${environmentNote} to ${target.fsPath}`);
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const SHOW_DETAILS_ACTION = 'Show details';

let importOutput: vscode.OutputChannel | undefined;

function importOutputChannel(): vscode.OutputChannel {
  importOutput ??= vscode.window.createOutputChannel('Routiq Import');
  return importOutput;
}

function reportImportSummary(summary: ImportSummary): void {
  const showMessage = summary.warnings.length > 0 ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
  void showMessage(formatSummaryMessage(summary), SHOW_DETAILS_ACTION).then((action) => action === SHOW_DETAILS_ACTION && showImportDetails(summary));
}

function showImportDetails(summary: ImportSummary): void {
  const channel = importOutputChannel();
  channel.clear();
  formatSummaryDetails(summary).forEach((line) => channel.appendLine(line));
  channel.show(true);
}

function collectionsFromDetection(detection: Extract<ImportDetection, { data: unknown }>, warnings: string[]): Collection[] {
  return convertForeignFormat(detection, undefined, warnings) ?? parseImportedCollections(detection.data, undefined, warnings);
}

async function storeImportedSecrets(vault: SecretVault, collections: Collection[]): Promise<Collection[]> {
  for (const collection of collections) {
    await vault.saveDraft({ ...collection, variables: [], environments: [] }, collection);
  }
  return collections.map((collection) => ({ ...collection, ...stripDraftSecrets(collection) }));
}

async function importCollectionsFromDetection(storage: Storage, vault: SecretVault, detection: Extract<ImportDetection, { data: unknown }>): Promise<void> {
  const warnings: string[] = [];
  const collections = collectionsFromDetection(detection, warnings);
  storage.importCollections(await storeImportedSecrets(vault, collections));
  reportImportSummary(summarizeImport(collections, warnings));
}

async function importEnvironmentIntoCollection(
  storage: Storage,
  vault: SecretVault,
  detection: Extract<ImportDetection, { kind: 'postman-environment' }>,
  node?: TreeNode,
): Promise<void> {
  const collectionId = await pickCollectionId(storage, node);
  const collection = collectionId ? storage.getCollection(collectionId) : undefined;
  if (!collection) {
    return;
  }
  const environment = importPostmanEnvironment(detection.data);
  const draft = withAddedEnvironment(collection, environment);
  await vault.saveDraft(collection, draft);
  storage.applyEnvironmentsDraft(collection.id, stripDraftSecrets(draft));
  vscode.window.showInformationMessage(formatEnvironmentImportMessage(environment.name, collection.name));
}

async function importCurlWithDestination(storage: Storage, command: string, node?: TreeNode): Promise<RequestModel | undefined> {
  const destination = await pickDestination(storage, node);
  return destination && importCurlCommand(storage, command, destination);
}

export async function importFromText(storage: Storage, vault: SecretVault, text: string, openRequest: (requestId: string) => void, node?: TreeNode): Promise<void> {
  const detection = detectImportFormat(text);
  try {
    if (detection.kind === 'unrecognized') {
      vscode.window.showErrorMessage(`Routiq import failed: ${detection.reason}`);
    } else if (detection.kind === 'curl') {
      const request = await importCurlWithDestination(storage, detection.command, node);
      if (request) {
        openRequest(request.id);
      }
    } else if (detection.kind === 'postman-environment') {
      await importEnvironmentIntoCollection(storage, vault, detection, node);
    } else {
      await importCollectionsFromDetection(storage, vault, detection);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Routiq import failed: ${describeFailure(error)}`);
  }
}

async function importFromFile(storage: Storage, vault: SecretVault, openRequest: (requestId: string) => void, node?: TreeNode): Promise<void> {
  const [source] =
    (await vscode.window.showOpenDialog({ canSelectMany: false, filters: IMPORT_FILTERS, openLabel: 'Import' })) ?? [];
  if (!source) {
    return;
  }
  const bytes = await vscode.workspace.fs.readFile(source);
  await importFromText(storage, vault, Buffer.from(bytes).toString('utf8'), openRequest, node);
}

export async function importFromClipboard(storage: Storage, vault: SecretVault, openRequest: (requestId: string) => void, node?: TreeNode): Promise<void> {
  await importFromText(storage, vault, await vscode.env.clipboard.readText(), openRequest, node);
}

async function askForCurlCommand(): Promise<string | undefined> {
  const clipboard = await vscode.env.clipboard.readText();
  if (detectImportFormat(clipboard).kind === 'curl') {
    const choice = await vscode.window.showQuickPick([USE_CLIPBOARD_LABEL, TYPE_CURL_LABEL], { placeHolder: 'Import cURL' });
    if (!choice) {
      return undefined;
    }
    if (choice === USE_CLIPBOARD_LABEL) {
      return clipboard;
    }
  }
  return vscode.window.showInputBox({
    prompt: 'cURL command',
    placeHolder: "curl -X POST 'https://api.example.com/items' -H 'Content-Type: application/json' -d '{\"a\":1}'",
    validateInput: (value) => (value.trim() ? undefined : 'Enter a cURL command'),
  });
}

export async function importCurl(storage: Storage, openRequest: (requestId: string) => void, node?: TreeNode): Promise<void> {
  const command = await askForCurlCommand();
  if (command === undefined) {
    return;
  }
  const request = await importCurlWithDestination(storage, command, node);
  if (request) {
    openRequest(request.id);
  }
}

export async function chooseImportSource(storage: Storage, vault: SecretVault, openRequest: (requestId: string) => void, node?: TreeNode): Promise<void> {
  const choice = await vscode.window.showQuickPick([FROM_FILE_LABEL, FROM_CLIPBOARD_LABEL, CURL_LABEL], { placeHolder: 'Import from…' });
  if (choice === FROM_FILE_LABEL) {
    await importFromFile(storage, vault, openRequest, node);
  } else if (choice === FROM_CLIPBOARD_LABEL) {
    await importFromClipboard(storage, vault, openRequest, node);
  } else if (choice === CURL_LABEL) {
    await importCurl(storage, openRequest, node);
  }
}
