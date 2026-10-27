import { KeyValue, VariableSuggestion } from '../shared/types';
import { DYNAMIC_VARIABLE_NAMES } from './dynamicVariableNames';

function describe(variable: KeyValue, source: VariableSuggestion['source']): VariableSuggestion {
  return variable.secret ? { name: variable.key, source, isSecret: true } : { name: variable.key, source, value: variable.value };
}

function describeEnabled(variables: KeyValue[], source: VariableSuggestion['source']): VariableSuggestion[] {
  return variables.filter((variable) => variable.enabled && variable.key).map((variable) => describe(variable, source));
}

export function buildVariableSuggestions(baseVariables: KeyValue[], environmentVariables: KeyValue[] = []): VariableSuggestion[] {
  const all: VariableSuggestion[] = [
    ...describeEnabled(environmentVariables, 'environment'),
    ...describeEnabled(baseVariables, 'base'),
    ...DYNAMIC_VARIABLE_NAMES.map((name) => ({ name, source: 'dynamic' as const })),
  ];
  return all.filter((candidate, index) => all.findIndex((other) => other.name === candidate.name) === index);
}
