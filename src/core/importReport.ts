import { Collection, CollectionEntry, FolderModel } from '../shared/types';

export type ImportWarnings = string[];

export interface ImportSummary {
  collections: number;
  folders: number;
  requests: number;
  environments: number;
  warnings: string[];
}

interface EntryCounts {
  folders: number;
  requests: number;
}

function isFolder(entry: CollectionEntry): entry is FolderModel {
  return 'items' in entry;
}

function countEntries(entries: CollectionEntry[]): EntryCounts {
  return entries.reduce<EntryCounts>(
    (counts, entry) => {
      if (!isFolder(entry)) {
        return { ...counts, requests: counts.requests + 1 };
      }
      const nested = countEntries(entry.items);
      return { folders: counts.folders + 1 + nested.folders, requests: counts.requests + nested.requests };
    },
    { folders: 0, requests: 0 },
  );
}

export function summarizeImport(collections: Collection[], warnings: string[] = []): ImportSummary {
  const counts = countEntries(collections.flatMap((collection) => collection.items));
  const environments = collections.reduce((total, collection) => total + collection.environments.length, 0);
  return { collections: collections.length, ...counts, environments, warnings: [...warnings] };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function formatSummaryMessage(summary: ImportSummary): string {
  const parts = [plural(summary.collections, 'collection'), plural(summary.folders, 'folder'), plural(summary.requests, 'request')];
  const warningPart = summary.warnings.length > 0 ? `, ${plural(summary.warnings.length, 'warning')}` : '';
  return `Imported ${parts.join(', ')}${warningPart}.`;
}

export function formatSummaryDetails(summary: ImportSummary): string[] {
  const lines = [
    formatSummaryMessage(summary),
    `Collections: ${summary.collections}`,
    `Folders: ${summary.folders}`,
    `Requests: ${summary.requests}`,
    `Environments: ${summary.environments}`,
  ];
  if (summary.warnings.length === 0) {
    return lines;
  }
  return [...lines, '', 'Warnings:', ...summary.warnings.map((warning) => `  - ${warning}`)];
}

export function formatEnvironmentImportMessage(environmentName: string, collectionName: string): string {
  return `Imported environment "${environmentName}" into "${collectionName}".`;
}
