import { GraphqlFieldSummary, GraphqlSchemaSummary, GraphqlTypeSummary } from '../../shared/types';

export interface SchemaSearchResult {
  type: GraphqlTypeSummary;
  fields: GraphqlFieldSummary[];
}

function matches(text: string | undefined, query: string): boolean {
  return text !== undefined && text.toLowerCase().includes(query);
}

function fieldMatches(field: GraphqlFieldSummary, query: string): boolean {
  return matches(field.name, query) || matches(field.description, query) || field.args.some((argument) => matches(argument.name, query));
}

function rootRank(schema: GraphqlSchemaSummary, typeName: string): number {
  return [schema.queryType, schema.mutationType, schema.subscriptionType].includes(typeName) ? 0 : 1;
}

export function searchSchema(schema: GraphqlSchemaSummary, rawQuery: string): SchemaSearchResult[] {
  return matchingTypes(schema, rawQuery).sort((left, right) => rootRank(schema, left.type.name) - rootRank(schema, right.type.name));
}

function matchingTypes(schema: GraphqlSchemaSummary, rawQuery: string): SchemaSearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') {
    return schema.types.map((type) => ({ type, fields: type.fields }));
  }
  return schema.types.flatMap((type) => {
    const typeMatches = matches(type.name, query) || matches(type.description, query);
    const fields = typeMatches ? type.fields : type.fields.filter((field) => fieldMatches(field, query));
    return typeMatches || fields.length > 0 ? [{ type, fields }] : [];
  });
}

export function operationKeywordFor(schema: GraphqlSchemaSummary, typeName: string): 'query' | 'mutation' | 'subscription' {
  if (typeName === schema.mutationType) {
    return 'mutation';
  }
  return typeName === schema.subscriptionType ? 'subscription' : 'query';
}
