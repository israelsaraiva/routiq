import { HelpItem, HelpSection, ShortcutEntry } from './helpContent';

function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function containsAllTokens(haystack: string, tokens: string[]): boolean {
  const lowered = haystack.toLowerCase();
  return tokens.every((token) => lowered.includes(token));
}

function itemText(item: HelpItem): string {
  return [item.title, ...item.body, item.code ?? '', ...(item.keywords ?? [])].join(' ');
}

function shortcutText(shortcut: ShortcutEntry): string {
  return `${shortcut.keys} ${shortcut.action} ${shortcut.where}`;
}

function sectionHeading(section: HelpSection): string {
  return `${section.title} ${section.summary}`;
}

export function searchHelp(sections: HelpSection[], query: string): HelpSection[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return sections;
  }
  return sections.flatMap((section) => {
    if (containsAllTokens(sectionHeading(section), tokens)) {
      return [section];
    }
    const items = section.items.filter((item) => containsAllTokens(itemText(item), tokens));
    const shortcuts = section.shortcuts?.filter((shortcut) => containsAllTokens(shortcutText(shortcut), tokens));
    return items.length > 0 || (shortcuts?.length ?? 0) > 0 ? [{ ...section, items, shortcuts }] : [];
  });
}
