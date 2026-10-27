import { Collection, Environment, EnvironmentsDraft, KeyValue } from '../shared/types';
import { IdGenerator, generateId } from './ids';
import { Json, isObject } from './jsonValues';

export function isPostmanEnvironment(data: Json): boolean {
  const scope = data._postman_variable_scope;
  const hasScope = scope === 'environment' || scope === 'globals';
  return typeof data.name === 'string' && Array.isArray(data.values) && !Array.isArray(data.item) && (hasScope || data.values.every(isObject));
}

function toVariable(entry: Json): KeyValue {
  const secret = entry.type === 'secret';
  return {
    key: entry.key,
    value: entry.value === undefined || entry.value === null ? '' : String(entry.value),
    enabled: entry.enabled !== false,
    ...(secret ? { secret: true } : {}),
  };
}

export function importPostmanEnvironment(data: Json, newId: IdGenerator = generateId): Environment {
  const entries: Json[] = data.values.filter((entry: unknown) => isObject(entry) && typeof entry.key === 'string');
  return { id: newId(), name: String(data.name || 'Imported Environment'), variables: entries.map(toVariable) };
}

export function withAddedEnvironment(collection: Collection, environment: Environment): EnvironmentsDraft {
  return {
    variables: collection.variables,
    environments: [...collection.environments, environment],
    activeEnvironmentId: collection.activeEnvironmentId,
  };
}
