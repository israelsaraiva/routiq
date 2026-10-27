import { describe, expect, it } from 'vitest';
import { extensionForContentType, findContentType, languageForBody } from './responseBody';

describe('responseBody', () => {
  it('maps content types to extensions', () => {
    expect(extensionForContentType('application/json; charset=utf-8')).toBe('json');
    expect(extensionForContentType('application/vnd.api+json')).toBe('json');
    expect(extensionForContentType('text/html')).toBe('html');
    expect(extensionForContentType('application/octet-stream')).toBe('txt');
  });

  it('finds the content-type header case-insensitively', () => {
    expect(findContentType([['Content-Type', 'text/xml']])).toBe('text/xml');
    expect(findContentType([])).toBe('');
  });

  it('detects language from header then body', () => {
    expect(languageForBody('text/html', 'x')).toBe('xml');
    expect(languageForBody('', '{"a":1}')).toBe('json');
    expect(languageForBody('', '{nope')).toBe('plain');
    expect(languageForBody('text/plain', '<a/>')).toBe('xml');
  });
});
