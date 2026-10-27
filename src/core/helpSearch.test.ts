import { describe, expect, it } from 'vitest';
import { HELP_SECTIONS } from './helpContent';
import { searchHelp } from './helpSearch';

describe('searchHelp', () => {
  it('returns every section for a blank query', () => {
    expect(searchHelp(HELP_SECTIONS, '   ')).toBe(HELP_SECTIONS);
  });

  it('keeps only matching items of a section', () => {
    const result = searchHelp(HELP_SECTIONS, 'uuid');
    expect(result.map((section) => section.id)).toEqual(['variables-and-environments']);
    expect(result[0].items.map((item) => item.id)).toEqual(['dynamic-variables']);
  });

  it('finds the Variables section with its worked examples', () => {
    const result = searchHelp(HELP_SECTIONS, 'baseUrl');
    expect(result.map((section) => section.id)).toContain('variables-and-environments');
    const items = result.find((section) => section.id === 'variables-and-environments')?.items.map((item) => item.id);
    expect(items).toEqual(expect.arrayContaining(['define-variable', 'use-variables']));
    expect(searchHelp(HELP_SECTIONS, 'unresolved orange').flatMap((section) => section.items.map((item) => item.id))).toContain('variable-highlighting');
    expect(searchHelp(HELP_SECTIONS, 'rq.variables.set post-response').flatMap((section) => section.items.map((item) => item.id))).toContain('set-variable-from-script');
  });

  it('keeps all items when the section heading matches', () => {
    const section = searchHelp(HELP_SECTIONS, 'grpc').find((candidate) => candidate.id === 'grpc');
    expect(section?.items).toHaveLength(2);
  });

  it('requires every word to match, case-insensitively', () => {
    expect(searchHelp(HELP_SECTIONS, 'SELF-SIGNED reject').flatMap((section) => section.items.map((item) => item.id))).toContain('faq-self-signed');
    expect(searchHelp(HELP_SECTIONS, 'uuid zzzznotfound')).toEqual([]);
  });

  it('filters keyboard shortcuts', () => {
    const section = searchHelp(HELP_SECTIONS, 'prettify shift').find((candidate) => candidate.id === 'keyboard-shortcuts');
    const shortcuts = section?.shortcuts ?? [];
    expect(shortcuts.map((shortcut) => shortcut.keys)).toContain('Shift+Alt+F');
    expect(shortcuts.every((shortcut) => !/Cmd\/Ctrl\+S/.test(shortcut.keys))).toBe(true);
  });

  it('gives every item and section a unique id', () => {
    const ids = HELP_SECTIONS.flatMap((section) => [section.id, ...section.items.map((item) => item.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
