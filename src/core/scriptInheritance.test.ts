import { describe, expect, it } from 'vitest';
import { combineInheritedScripts } from './scriptInheritance';

describe('combineInheritedScripts', () => {
  const outer = { pre: 'outerPre', post: 'outerPost' };
  const inner = { pre: 'innerPre', post: 'innerPost' };
  const own = { pre: 'ownPre', post: 'ownPost' };

  it('orders pre outermost first and post innermost first', () => {
    expect(combineInheritedScripts([outer, inner], own)).toEqual({ pre: 'outerPre\ninnerPre\nownPre', post: 'ownPost\ninnerPost\nouterPost' });
  });

  it('skips missing and empty scripts', () => {
    expect(combineInheritedScripts([undefined, { pre: '', post: 'p' }], undefined)).toEqual({ pre: '', post: 'p' });
    expect(combineInheritedScripts([undefined], undefined)).toBeUndefined();
  });
});
