import { describe, expect, it } from 'vitest';
import { createCollection, createFolder, createRequest } from './factories';
import { filterEntries, flattenRequests, searchRequests } from './requestSearch';

function sampleCollection() {
  const login = { ...createRequest('Login', () => 'r1'), method: 'POST' as const, url: 'https://api.test/auth/login' };
  const users = { ...createRequest('List users', () => 'r2'), url: 'https://api.test/users' };
  const folder = { ...createFolder('Admin', () => 'f1'), items: [users] };
  return { ...createCollection('Shop', () => 'c1'), items: [login, folder] };
}

describe('flattenRequests', () => {
  it('lists requests with their collection and folder path', () => {
    const entries = flattenRequests([sampleCollection()]);
    expect(entries.map((entry) => [entry.requestId, entry.path])).toEqual([['r1', 'Shop'], ['r2', 'Shop / Admin']]);
  });
});

describe('searchRequests', () => {
  it('matches on name, method, url and path', () => {
    const entries = flattenRequests([sampleCollection()]);
    expect(searchRequests(entries, 'post').map((entry) => entry.requestId)).toEqual(['r1']);
    expect(searchRequests(entries, 'admin').map((entry) => entry.requestId)).toEqual(['r2']);
    expect(searchRequests(entries, '/users').map((entry) => entry.requestId)).toEqual(['r2']);
  });
});

describe('filterEntries', () => {
  it('keeps matching requests with their ancestor folders and prunes the rest', () => {
    const filtered = filterEntries(sampleCollection().items, 'users');
    expect(filtered.map((entry) => entry.id)).toEqual(['f1']);
  });

  it('keeps a whole folder when its name matches and returns everything for an empty query', () => {
    const { items } = sampleCollection();
    expect(filterEntries(items, 'admin')).toEqual([items[1]]);
    expect(filterEntries(items, '')).toBe(items);
  });
});
