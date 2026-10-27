import { Collection, VariableSuggestion } from '../shared/types';
import { findActiveEnvironment } from './environments';
import { DYNAMIC_VARIABLE_NAMES } from './variables';

function namesOf(variables: Collection['variables']): string[] {
  return variables.filter((variable) => variable.enabled && variable.key).map((variable) => variable.key);
}

function suggestions(names: string[], source: VariableSuggestion['source']): VariableSuggestion[] {
  return names.map((name) => ({ name, source }));
}

export function collectVariableSuggestions(collection: Collection): VariableSuggestion[] {
  const active = findActiveEnvironment(collection);
  const all = [
    ...suggestions(active ? namesOf(active.variables) : [], 'environment'),
    ...suggestions(namesOf(collection.variables), 'base'),
    ...suggestions(DYNAMIC_VARIABLE_NAMES, 'dynamic'),
  ];
  return all.filter((candidate, index) => all.findIndex((other) => other.name === candidate.name) === index);
}
