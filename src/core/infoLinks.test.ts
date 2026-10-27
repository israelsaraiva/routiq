import { describe, expect, it } from 'vitest';
import { collectInfoLinks } from './infoLinks';

describe('collectInfoLinks', () => {
  it('returns nothing when the manifest has no link fields', () => {
    expect(collectInfoLinks({})).toEqual([]);
  });

  it('reads string and object forms and normalizes git urls', () => {
    const links = collectInfoLinks({
      homepage: 'https://example.com',
      repository: { url: 'git+https://github.com/acme/routiq.git' },
      bugs: { url: 'https://github.com/acme/routiq/issues' },
    });
    expect(links.map((entry) => entry.url)).toEqual([
      'https://example.com',
      'https://github.com/acme/routiq',
      'https://github.com/acme/routiq/issues',
    ]);
  });

  it('ignores non-https urls', () => {
    expect(collectInfoLinks({ homepage: 'javascript:alert(1)', bugs: 'http://insecure.test' })).toEqual([]);
  });
});
