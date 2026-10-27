import { describe, expect, it } from 'vitest';
import { formatTimeDelta } from './timeDelta';

describe('formatTimeDelta', () => {
  it('formats milliseconds, seconds and minutes', () => {
    expect(formatTimeDelta(250)).toBe('+250ms');
    expect(formatTimeDelta(-1500)).toBe('+1.5s');
    expect(formatTimeDelta(125000)).toBe('+2m 5s');
  });
});
