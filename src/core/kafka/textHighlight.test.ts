import { describe, expect, it } from 'vitest';
import { splitHighlights } from './textHighlight';

describe('splitHighlights', () => {
  it('marks keywords case-insensitively and keeps the rest', () => {
    expect(splitHighlights('a FAIL b commandId')).toEqual([
      { text: 'a ', kind: undefined },
      { text: 'FAIL', kind: 'fail' },
      { text: ' b ', kind: undefined },
      { text: 'commandId', kind: 'commandId' },
    ]);
  });
});
