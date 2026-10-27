import { GraphqlSchemaSummary, GraphqlTypeSummary } from '../../shared/types';
import { GraphqlToken, significantTokens, tokenizeGraphql } from './tokens';

export interface GraphqlSuggestion {
  label: string;
  detail?: string;
}

export interface GraphqlSuggestions {
  replaceFrom: number;
  items: GraphqlSuggestion[];
}

type Scope = { kind: 'selection'; typeName?: string } | { kind: 'group' };

interface WalkState {
  scopes: Scope[];
  rootTypeName?: string;
  fieldName?: string;
  fragmentTypeName?: string;
  afterOn: boolean;
  insideHeader: boolean;
}

const OPERATION_KEYWORDS = ['query', 'mutation', 'subscription', 'fragment'];
const WORD_AT_END = /[_A-Za-z][_0-9A-Za-z]*$/;

function typeNamed(schema: GraphqlSchemaSummary, name: string | undefined): GraphqlTypeSummary | undefined {
  return name === undefined ? undefined : schema.types.find((type) => type.name === name);
}

function rootTypeFor(schema: GraphqlSchemaSummary, keyword: string): string | undefined {
  if (keyword === 'mutation') {
    return schema.mutationType;
  }
  return keyword === 'subscription' ? schema.subscriptionType : schema.queryType;
}

function fieldTypeName(schema: GraphqlSchemaSummary, scope: Scope | undefined, fieldName: string | undefined): string | undefined {
  if (scope?.kind !== 'selection') {
    return undefined;
  }
  return typeNamed(schema, scope.typeName)?.fields.find((field) => field.name === fieldName)?.namedType;
}

function openBrace(schema: GraphqlSchemaSummary, state: WalkState): void {
  const top = state.scopes[state.scopes.length - 1];
  if (top?.kind === 'group') {
    state.scopes.push({ kind: 'group' });
    return;
  }
  const typeName = state.fragmentTypeName ?? (state.scopes.length === 0 ? state.rootTypeName : fieldTypeName(schema, top, state.fieldName));
  state.scopes.push({ kind: 'selection', typeName });
  state.fieldName = undefined;
  state.fragmentTypeName = undefined;
  state.insideHeader = false;
}

function closeScope(state: WalkState, closing: string): void {
  state.scopes.pop();
  if (closing === '}') {
    state.fieldName = undefined;
  }
}

function applyPunctuation(schema: GraphqlSchemaSummary, state: WalkState, token: GraphqlToken): void {
  if (token.text === '{') {
    openBrace(schema, state);
  } else if (token.text === '(' || token.text === '[') {
    state.scopes.push({ kind: 'group' });
  } else if (token.text === '}' || token.text === ')' || token.text === ']') {
    closeScope(state, token.text);
  }
}

function applyWord(schema: GraphqlSchemaSummary, state: WalkState, token: GraphqlToken): void {
  const topIsSelection = state.scopes.length === 0 || state.scopes[state.scopes.length - 1].kind === 'selection';
  if (!topIsSelection) {
    return;
  }
  if (token.kind === 'keyword' && token.text === 'on') {
    state.afterOn = true;
    return;
  }
  if (state.scopes.length === 0 && token.kind === 'keyword' && OPERATION_KEYWORDS.includes(token.text)) {
    state.rootTypeName = rootTypeFor(schema, token.text);
    state.insideHeader = true;
    state.fragmentTypeName = undefined;
    return;
  }
  if (token.kind === 'name' || token.kind === 'keyword') {
    if (state.afterOn) {
      state.fragmentTypeName = token.text;
    } else if (!state.insideHeader || state.scopes.length > 0) {
      state.fieldName = token.text;
    }
    state.afterOn = false;
  }
}

function walk(schema: GraphqlSchemaSummary, tokens: GraphqlToken[]): WalkState {
  const state: WalkState = { scopes: [], afterOn: false, insideHeader: false };
  for (const token of tokens) {
    if (token.kind === 'punctuation') {
      if (token.text === '{' && state.scopes.length === 0 && !state.insideHeader) {
        state.rootTypeName = schema.queryType;
      }
      applyPunctuation(schema, state, token);
    } else {
      applyWord(schema, state, token);
    }
  }
  return state;
}

function startsWith(label: string, prefix: string): boolean {
  return label.toLowerCase().startsWith(prefix.toLowerCase());
}

function fieldSuggestions(type: GraphqlTypeSummary | undefined): GraphqlSuggestion[] {
  const fields = (type?.fields ?? []).map((field) => ({ label: field.name, detail: field.type }));
  return [...fields, { label: '__typename', detail: 'String!' }];
}

function compositeTypeSuggestions(schema: GraphqlSchemaSummary): GraphqlSuggestion[] {
  return schema.types
    .filter((type) => type.kind === 'object' || type.kind === 'interface' || type.kind === 'union')
    .map((type) => ({ label: type.name, detail: type.kind }));
}

function topLevelSuggestions(): GraphqlSuggestion[] {
  return OPERATION_KEYWORDS.map((label) => ({ label, detail: 'keyword' }));
}

function candidatesFor(schema: GraphqlSchemaSummary, state: WalkState): GraphqlSuggestion[] {
  const top = state.scopes[state.scopes.length - 1];
  if (state.afterOn) {
    return compositeTypeSuggestions(schema);
  }
  if (top === undefined) {
    return state.insideHeader ? [] : topLevelSuggestions();
  }
  return top.kind === 'selection' ? fieldSuggestions(typeNamed(schema, top.typeName)) : [];
}

export function suggestGraphql(document: string, caret: number, schema: GraphqlSchemaSummary): GraphqlSuggestions {
  const beforeCaret = document.slice(0, caret);
  const prefix = WORD_AT_END.exec(beforeCaret)?.[0] ?? '';
  const replaceFrom = caret - prefix.length;
  const tokens = significantTokens(tokenizeGraphql(beforeCaret.slice(0, replaceFrom)));
  const items = candidatesFor(schema, walk(schema, tokens)).filter((item) => startsWith(item.label, prefix) && item.label !== prefix);
  return { replaceFrom, items };
}

export function applySuggestion(document: string, caret: number, suggestions: GraphqlSuggestions, label: string): { text: string; caret: number } {
  const text = `${document.slice(0, suggestions.replaceFrom)}${label}${document.slice(caret)}`;
  return { text, caret: suggestions.replaceFrom + label.length };
}
