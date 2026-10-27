import { describe, expect, it } from 'vitest';
import { CollectionEntry, FolderModel, RequestModel } from '../shared/types';
import { createFolder, createRequest } from './factories';
import { compareNames, sortEntries, sortFolderItems } from './entrySorting';

function request(name: string, method: RequestModel['method'] = 'GET'): RequestModel {
  return { ...createRequest(name, () => `r-${name}`), method };
}

function folder(name: string, items: CollectionEntry[] = []): FolderModel {
  return { ...createFolder(name, () => `f-${name}`), items };
}

const names = (entries: CollectionEntry[]) => entries.map((entry) => entry.name);

describe('compareNames', () => {
  it('is case-insensitive and natural', () => {
    expect(['item10', 'Item2', 'item1'].sort(compareNames)).toEqual(['item1', 'Item2', 'item10']);
  });
});

describe('sortEntries', () => {
  const items = () => [request('beta'), folder('zeta'), request('Alpha'), folder('eta')];

  it('puts folders first and sorts ascending or descending', () => {
    expect(names(sortEntries(items(), 'name-asc'))).toEqual(['eta', 'zeta', 'Alpha', 'beta']);
    expect(names(sortEntries(items(), 'name-desc'))).toEqual(['zeta', 'eta', 'beta', 'Alpha']);
  });

  it('groups requests by method, others last, then by name', () => {
    const sorted = sortEntries([request('b', 'DELETE'), request('z', 'GET'), request('a', 'OPTIONS'), request('c', 'POST'), request('a', 'GET'), request('p', 'PATCH')], 'method');
    expect(sorted.map((entry) => `${(entry as RequestModel).method}:${entry.name}`)).toEqual(['GET:a', 'GET:z', 'POST:c', 'PATCH:p', 'DELETE:b', 'OPTIONS:a']);
  });

  it('only sorts nested folders when recursive', () => {
    const tree = [folder('b', [request('y'), request('x')])];
    expect(names((sortEntries(tree, 'name-asc')[0] as FolderModel).items)).toEqual(['y', 'x']);
    expect(names((sortEntries(tree, 'name-asc', true)[0] as FolderModel).items)).toEqual(['x', 'y']);
  });

  it('does not mutate the input', () => {
    const input = items();
    sortEntries(input, 'name-asc');
    expect(names(input)).toEqual(['beta', 'zeta', 'Alpha', 'eta']);
  });
});

describe('sortFolderItems', () => {
  it('sorts only the chosen folder', () => {
    const tree = [folder('a', [request('y'), request('x')]), folder('b', [request('q'), request('p')])];
    const sorted = sortFolderItems(tree, 'f-b', 'name-asc');
    expect(names((sorted[0] as FolderModel).items)).toEqual(['y', 'x']);
    expect(names((sorted[1] as FolderModel).items)).toEqual(['p', 'q']);
  });
});
