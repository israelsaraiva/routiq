import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Binding {
  command?: string;
  when?: string;
}

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const contributes = manifest.contributes ?? {};

const BUILT_IN_CONTEXT_KEYS = new Set([
  'view', 'viewItem', 'viewContainer', 'resourceScheme', 'resourceExtname', 'resourceFilename', 'resourceLangId', 'editorLangId',
  'editorTextFocus', 'editorFocus', 'focusedView', 'activeViewlet', 'config', 'webviewId', 'activeWebviewPanelId', 'isMac', 'isWindows',
  'isLinux', 'true', 'false', 'in', 'not',
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' || entry === 'test' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

const sources = sourceFiles(join(root, 'src')).map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const allSource = sources.map((source) => source.text).join('\n');

function declaredCommands(): Set<string> {
  return new Set((contributes.commands ?? []).map((command: { command: string }) => command.command));
}

function menuBindings(): Binding[] {
  return Object.values<Binding[]>(contributes.menus ?? {}).flat();
}

function keybindings(): Binding[] {
  return contributes.keybindings ?? [];
}

function activationCommands(): string[] {
  return (manifest.activationEvents ?? []).filter((event: string) => event.startsWith('onCommand:')).map((event: string) => event.slice('onCommand:'.length));
}

function welcomeCommands(): string[] {
  const contents: string[] = (contributes.viewsWelcome ?? []).map((welcome: { contents: string }) => welcome.contents);
  return contents.flatMap((text) => [...text.matchAll(/\(command:([\w.]+)/g)].map((match) => match[1]));
}

function whenClauses(): string[] {
  const clauses = [...menuBindings(), ...keybindings()].map((binding) => binding.when).filter((when): when is string => typeof when === 'string');
  const welcome = (contributes.viewsWelcome ?? []).map((entry: { when?: string }) => entry.when).filter(Boolean);
  return [...clauses, ...welcome];
}

function contextKeysIn(when: string): string[] {
  const withoutRegexLiterals = when.replace(/\/(?:\\.|[^/\\])+\/[a-z]*/g, ' ').replace(/'[^']*'|"[^"]*"/g, ' ').replace(/(?:==|!=)\s*[\w.-]+/g, ' ');
  return [...withoutRegexLiterals.matchAll(/[A-Za-z_][\w.-]*/g)].map((match) => match[0]);
}

function customContextKeysUsed(): string[] {
  const keys = whenClauses().flatMap(contextKeysIn).filter((key) => !BUILT_IN_CONTEXT_KEYS.has(key));
  return [...new Set(keys)];
}

function contextKeysSetInCode(): Set<string> {
  const constants = new Map([...allSource.matchAll(/const (\w+)\s*=\s*'([\w.]+)'/g)].map((match) => [match[1], match[2]]));
  const literal = [...allSource.matchAll(/'setContext',\s*(?:'([\w.]+)'|(\w+))/g)].map((match) => match[1] ?? constants.get(match[2]));
  return new Set(literal.filter((key): key is string => typeof key === 'string'));
}

function contributedViewIds(): Set<string> {
  return new Set(Object.values<Array<{ id: string }>>(contributes.views ?? {}).flat().map((view) => view.id));
}

function settingsReadInCode(): string[] {
  const keys = new Set<string>();
  for (const { text } of sources) {
    for (const match of text.matchAll(/getConfiguration\('routiq'\)\s*\.get(?:<[^>]*>)?\('([^']+)'/g)) {
      keys.add(match[1]);
    }
    for (const alias of text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*vscode\.workspace\.getConfiguration\('routiq'\)/g)) {
      for (const read of text.matchAll(new RegExp(`\\b${alias[1]}\\.get(?:<[^>]*>)?\\('([^']+)'`, 'g'))) {
        keys.add(read[1]);
      }
    }
    for (const match of text.matchAll(/affectsConfiguration\('routiq\.([^']+)'/g)) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

function commandsReferencedInCode(): string[] {
  const executed = [...allSource.matchAll(/executeCommand\(\s*'(routiq\.[\w.]+)'/g)].map((match) => match[1]);
  const markdownLinks = [...allSource.matchAll(/command:(routiq\.[\w.]+)/g)].map((match) => match[1]);
  return [...new Set([...executed, ...markdownLinks])];
}

function commandsRegisteredInCode(): string[] {
  return [...new Set([...allSource.matchAll(/register(?:<[^>]*>)?\(\s*'(routiq\.[\w.]+)'/g)].map((match) => match[1]))];
}

describe('package.json contributions', () => {
  it('declares every command referenced by menus, keybindings, activation events and welcome content', () => {
    const declared = declaredCommands();
    const referenced = [
      ...menuBindings().map((binding) => binding.command),
      ...keybindings().map((binding) => binding.command),
      ...activationCommands(),
      ...welcomeCommands(),
    ].filter((command): command is string => typeof command === 'string' && command.length > 0);
    const undeclared = referenced.filter((command) => !declared.has(command));
    expect(undeclared).toEqual([]);
  });

  it('declares every command registered or executed by the extension code', () => {
    const declared = declaredCommands();
    const undeclared = [...commandsRegisteredInCode(), ...commandsReferencedInCode()].filter((command) => !declared.has(command));
    expect(undeclared).toEqual([]);
  });

  it('registers every declared command in the extension code', () => {
    const registered = new Set(commandsRegisteredInCode());
    const unregistered = [...declaredCommands()].filter((command) => !registered.has(command as string));
    expect(unregistered).toEqual([]);
  });

  it('declares every command exactly once with a title', () => {
    const commands: Array<{ command: string; title?: string }> = contributes.commands ?? [];
    expect(new Set(commands.map((command) => command.command)).size).toBe(commands.length);
    expect(commands.filter((command) => !command.title)).toEqual([]);
  });

  it('sets every custom when-clause context key somewhere in the code', () => {
    const setInCode = contextKeysSetInCode();
    const views = contributedViewIds();
    const unset = customContextKeysUsed().filter((key) => !setInCode.has(key) && !views.has(key));
    expect(unset).toEqual([]);
  });

  it('declares every routiq.* setting read by the code', () => {
    const declared = new Set(Object.keys(contributes.configuration?.properties ?? {}));
    const undeclared = settingsReadInCode().filter((key) => !declared.has(`routiq.${key}`));
    expect(undeclared).toEqual([]);
  });

  it('reads every declared setting somewhere in the code', () => {
    const read = new Set(settingsReadInCode().map((key) => `routiq.${key}`));
    const unused = Object.keys(contributes.configuration?.properties ?? {}).filter((key) => !read.has(key));
    expect(unused).toEqual([]);
  });

  it('references only declared views from menus', () => {
    const views = contributedViewIds();
    const referencedViews = whenClauses().flatMap((when) => [...when.matchAll(/view\s*==\s*([\w.]+)/g)].map((match) => match[1]));
    expect(referencedViews.filter((view) => !views.has(view))).toEqual([]);
  });
});
