import { describe, expect, it } from 'vitest';
import { Collection } from '../shared/types';
import { createCollection } from './factories';
import { appendCollection, moveCollection, nextCollectionOrder, orderCollections, sortCollections } from './collectionOrder';
import { serializeCollection } from './serialization';
import { parseOwnCollection } from './collectionFormat';

function named(name: string, order?: number): Collection {
  const collection = createCollection(name, () => name);
  return order === undefined ? collection : { ...collection, order };
}

const ids = (collections: Collection[]) => collections.map((collection) => collection.id);

describe('orderCollections', () => {
  it('keeps file order when nothing has an order', () => {
    expect(ids(orderCollections([named('b'), named('a')]))).toEqual(['b', 'a']);
  });

  it('sorts by order and falls back to position for legacy files', () => {
    expect(ids(orderCollections([named('x', 5), named('legacy'), named('y', 0)]))).toEqual(['y', 'legacy', 'x']);
  });
});

describe('appendCollection', () => {
  it('places the new collection after legacy and ordered ones', () => {
    const appended = appendCollection([named('a'), named('b', 7)], named('c'));
    expect(appended[2].order).toBe(8);
    expect(ids(orderCollections(appended))).toEqual(['a', 'b', 'c']);
    expect(nextCollectionOrder([])).toBe(0);
  });
});

describe('moveCollection', () => {
  const base = () => [named('a'), named('b'), named('c')];

  it('moves before a target and renumbers', () => {
    const moved = moveCollection(base(), 'c', 'a');
    expect(ids(moved)).toEqual(['c', 'a', 'b']);
    expect(moved.map((collection) => collection.order)).toEqual([0, 1, 2]);
  });

  it('moves to the end without a target and is a no-op when unchanged', () => {
    expect(ids(moveCollection(base(), 'a'))).toEqual(['b', 'c', 'a']);
    const same = base();
    expect(moveCollection(same, 'c')).toBe(same);
  });
});

describe('sortCollections', () => {
  it('sorts by name in both directions', () => {
    const input = [named('b'), named('C'), named('a')];
    expect(ids(sortCollections(input, 'asc'))).toEqual(['a', 'b', 'C']);
    expect(ids(sortCollections(input, 'desc'))).toEqual(['C', 'b', 'a']);
  });
});

describe('order persistence', () => {
  it('round-trips the order field and omits it when unset', () => {
    const withOrder = JSON.parse(serializeCollection(named('a', 3)));
    expect(withOrder.order).toBe(3);
    expect(parseOwnCollection(withOrder, (id) => String(id)).order).toBe(3);
    expect(JSON.parse(serializeCollection(named('a'))).order).toBeUndefined();
    expect(parseOwnCollection({ id: 'a', name: 'a', items: [] }, (id) => String(id)).order).toBeUndefined();
  });
});
