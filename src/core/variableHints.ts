import { VariableSuggestion } from '../shared/types';

export const SECRET_MASK = '••••••';
export const UNRESOLVED_HINT = 'Unresolved variable';
const MAX_PREVIEW_LENGTH = 40;
const EMPTY_VALUE_LABEL = '(empty)';

const SCOPE_LABELS: Record<VariableSuggestion['source'], string> = {
  environment: 'environment',
  base: 'collection',
  dynamic: 'dynamic',
};

export function scopeLabel(suggestion: VariableSuggestion): string {
  return SCOPE_LABELS[suggestion.source] ?? String(suggestion.source);
}

function truncate(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ');
  return singleLine.length > MAX_PREVIEW_LENGTH ? `${singleLine.slice(0, MAX_PREVIEW_LENGTH)}…` : singleLine;
}

export function previewValue(suggestion: VariableSuggestion): string {
  if (suggestion.isSecret) {
    return SECRET_MASK;
  }
  if (suggestion.source === 'dynamic') {
    return 'generated on send';
  }
  return truncate(suggestion.value ?? '') || EMPTY_VALUE_LABEL;
}

export function describeVariable(name: string, byName: ReadonlyMap<string, VariableSuggestion>): string {
  const suggestion = byName.get(name);
  return suggestion ? `${name} (${scopeLabel(suggestion)}): ${previewValue(suggestion)}` : `${name}: ${UNRESOLVED_HINT}`;
}

export function indexSuggestions(suggestions: VariableSuggestion[]): Map<string, VariableSuggestion> {
  return new Map(suggestions.map((suggestion) => [suggestion.name, suggestion]));
}
