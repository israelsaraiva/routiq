import { describe, expect, it } from 'vitest';
import { feedbackMailto, parseAuthor } from './author';

describe('author', () => {
  it('parses the object and string forms', () => {
    expect(parseAuthor({ name: 'Ada', email: 'ada@example.com' })).toEqual({ name: 'Ada', email: 'ada@example.com' });
    expect(parseAuthor('Ada Lovelace <ada@example.com> (https://x.dev)')).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(parseAuthor(undefined)).toEqual({ name: '', email: '' });
  });

  it('builds a feedback mailto only when an email exists', () => {
    expect(feedbackMailto({ name: 'Ada', email: 'ada@example.com' }, 'Routiq', '1.0.0')).toBe('mailto:ada@example.com?subject=Routiq%201.0.0%20feedback');
    expect(feedbackMailto({ name: 'Ada', email: '' }, 'Routiq', '1.0.0')).toBeUndefined();
  });
});
