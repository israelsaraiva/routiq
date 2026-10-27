import { describe, expect, it } from 'vitest';
import { formatDiagnostics, redactCredentials, revealLabelFor } from './diagnostics';
import { AboutInfo } from './infoMessages';

const about: AboutInfo = {
  name: 'routiq',
  displayName: 'Routiq',
  version: '1.2.3',
  publisher: 'acme',
  authorName: 'Ada',
  authorEmail: 'ada@example.com',
  license: 'MIT',
  description: '',
  vscodeVersion: '1.90.0',
  nodeVersion: '20.1.0',
  electronVersion: '29.0.0',
  storageDirectory: '/home/me/.routiq',
  revealLabel: 'Reveal in file manager',
  collectionCount: 2,
  requestCount: 7,
};

describe('diagnostics', () => {
  it('redacts credentials embedded in URLs only', () => {
    expect(redactCredentials('http://user:pass@proxy:8080')).toBe('http://***@proxy:8080');
    expect(redactCredentials('http://proxy:8080')).toBe('http://proxy:8080');
    expect(redactCredentials(30000)).toBe(30000);
  });

  it('lists versions, counts and redacted settings without the storage path', () => {
    const text = formatDiagnostics(about, 'darwin', { 'routiq.proxy': 'http://u:p@proxy', 'routiq.timeoutMs': 5000 });
    expect(text).toContain('Routiq 1.2.3 (acme.routiq)');
    expect(text).toContain('Requests: 7');
    expect(text).toContain('routiq.proxy: "http://***@proxy"');
    expect(text).toContain('routiq.timeoutMs: 5000');
    expect(text).not.toContain('u:p');
    expect(text).not.toContain('/home/me');
  });

  it('labels the reveal action per platform', () => {
    expect(revealLabelFor('darwin')).toBe('Reveal in Finder');
    expect(revealLabelFor('win32')).toBe('Reveal in Explorer');
    expect(revealLabelFor('linux')).toBe('Reveal in file manager');
  });
});
