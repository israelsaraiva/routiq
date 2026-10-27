import * as vscode from 'vscode';
import { revealLabelFor } from '../core/diagnostics';
import { parseAuthor } from '../core/author';
import { AboutInfo } from '../core/infoMessages';
import { countRequests } from '../core/collectionTree';
import { SettingsSnapshot } from '../core/diagnostics';
import { Storage } from './storage';

interface ManifestFields {
  name?: string;
  displayName?: string;
  version?: string;
  publisher?: string;
  author?: unknown;
  license?: string;
  description?: string;
  contributes?: { configuration?: { properties?: Record<string, unknown> } };
}

function manifestOf(extension: vscode.Extension<unknown>): ManifestFields {
  return extension.packageJSON as ManifestFields;
}

export function collectAboutInfo(extension: vscode.Extension<unknown>, storage: Storage): AboutInfo {
  const manifest = manifestOf(extension);
  const author = parseAuthor(manifest.author);
  const collections = storage.getCollections();
  return {
    name: manifest.name ?? '',
    displayName: manifest.displayName ?? manifest.name ?? '',
    version: manifest.version ?? '',
    publisher: manifest.publisher ?? '',
    authorName: author.name,
    authorEmail: author.email,
    license: manifest.license ?? '',
    description: manifest.description ?? '',
    vscodeVersion: vscode.version,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron ?? 'n/a',
    storageDirectory: storage.directory,
    revealLabel: revealLabelFor(process.platform),
    collectionCount: collections.length,
    requestCount: collections.reduce((total, collection) => total + countRequests(collection.items), 0),
  };
}

export function snapshotSettings(extension: vscode.Extension<unknown>): SettingsSnapshot {
  const keys = Object.keys(manifestOf(extension).contributes?.configuration?.properties ?? {});
  const configuration = vscode.workspace.getConfiguration();
  return Object.fromEntries(keys.map((key) => [key, configuration.get(key)]));
}
