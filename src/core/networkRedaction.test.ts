import { describe, expect, it } from 'vitest';
import { redactProxyUrl, redactText, redactUrl } from './networkRedaction';

describe('redactUrl', () => {
  it('removes credentials, fragment and sensitive query values', () => {
    expect(redactUrl('https://user:pw@host.test/a?api_key=abc&page=2&access_token=t#frag')).toBe('https://host.test/a?api_key=***&page=2&access_token=***');
  });

  it('falls back to text redaction for unparsable input', () => {
    expect(redactUrl('not a url Bearer abc123')).toBe('not a url Bearer ***');
  });
});

describe('redactText and redactProxyUrl', () => {
  it('hides auth scheme values and embedded credentials', () => {
    expect(redactText('Authorization: Basic dXNlcjpwdw== via http://u:p@proxy:8080')).toBe('Authorization: Basic *** via http://***@proxy:8080');
  });

  it('strips proxy credentials', () => {
    expect(redactProxyUrl('http://u:p@proxy.corp:8080/')).toBe('http://proxy.corp:8080');
  });
});
