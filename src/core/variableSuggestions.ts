import { Collection, VariableSuggestion } from '../shared/types';
import { findActiveEnvironment } from './environments';
import { buildVariableSuggestions } from './variableCatalog';

export function collectVariableSuggestions(collection: Collection): VariableSuggestion[] {
  return buildVariableSuggestions(collection.variables, findActiveEnvironment(collection)?.variables);
}
