import {
  GraphQLArgument, GraphQLField, GraphQLInputField, GraphQLNamedType, GraphQLSchema, IntrospectionQuery, buildClientSchema, getNamedType,
  getIntrospectionQuery, isEnumType, isInputObjectType, isInterfaceType, isObjectType, isUnionType,
} from 'graphql';
import {
  GraphqlArgumentSummary, GraphqlFieldSummary, GraphqlSchemaSummary, GraphqlTypeKind, GraphqlTypeSummary, RequestModel,
} from '../../shared/types';

export const INTROSPECTION_QUERY = getIntrospectionQuery({ descriptions: true });

export function createIntrospectionRequest(request: RequestModel): RequestModel {
  const { scripts: _scripts, ...withoutScripts } = request;
  return {
    ...withoutScripts,
    method: 'POST',
    body: { type: 'graphql', text: INTROSPECTION_QUERY, form: [] },
  };
}

type FieldLike = GraphQLField<unknown, unknown> | GraphQLInputField;

function optionalDescription(description: string | null | undefined): { description?: string } {
  return description ? { description } : {};
}

function summarizeArgument(argument: GraphQLArgument): GraphqlArgumentSummary {
  return {
    name: argument.name,
    type: String(argument.type),
    ...optionalDescription(argument.description),
    ...(argument.defaultValue !== undefined ? { defaultValue: JSON.stringify(argument.defaultValue) } : {}),
  };
}

function summarizeField(field: FieldLike): GraphqlFieldSummary {
  const args = 'args' in field ? field.args.map(summarizeArgument) : [];
  const deprecated = 'deprecationReason' in field && Boolean(field.deprecationReason);
  return {
    name: field.name,
    type: String(field.type),
    namedType: getNamedType(field.type).name,
    ...optionalDescription(field.description),
    ...(deprecated ? { deprecated: true } : {}),
    args,
  };
}

function kindOf(type: GraphQLNamedType): GraphqlTypeKind {
  if (isObjectType(type)) {
    return 'object';
  }
  if (isInterfaceType(type)) {
    return 'interface';
  }
  if (isInputObjectType(type)) {
    return 'input';
  }
  if (isEnumType(type)) {
    return 'enum';
  }
  return isUnionType(type) ? 'union' : 'scalar';
}

function fieldsOf(type: GraphQLNamedType): FieldLike[] {
  if (isObjectType(type) || isInterfaceType(type) || isInputObjectType(type)) {
    return Object.values(type.getFields());
  }
  return [];
}

function membersOf(type: GraphQLNamedType, schema: GraphQLSchema): string[] {
  if (isEnumType(type)) {
    return type.getValues().map((value) => value.name);
  }
  if (isUnionType(type)) {
    return schema.getPossibleTypes(type).map((member) => member.name);
  }
  return [];
}

function summarizeType(type: GraphQLNamedType, schema: GraphQLSchema): GraphqlTypeSummary {
  return {
    name: type.name,
    kind: kindOf(type),
    ...optionalDescription(type.description),
    fields: fieldsOf(type).map(summarizeField),
    members: membersOf(type, schema),
  };
}

function isUserType(type: GraphQLNamedType): boolean {
  return !type.name.startsWith('__');
}

export function summarizeSchema(introspection: IntrospectionQuery): GraphqlSchemaSummary {
  const schema = buildClientSchema(introspection);
  const types = Object.values(schema.getTypeMap()).filter(isUserType).map((type) => summarizeType(type, schema));
  return {
    ...(schema.getQueryType() ? { queryType: schema.getQueryType()?.name } : {}),
    ...(schema.getMutationType() ? { mutationType: schema.getMutationType()?.name } : {}),
    ...(schema.getSubscriptionType() ? { subscriptionType: schema.getSubscriptionType()?.name } : {}),
    types: types.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export type SchemaParseResult = { ok: true; schema: GraphqlSchemaSummary } | { ok: false; message: string };

function describeParseFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseIntrospectionResponse(responseBody: string): SchemaParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return { ok: false, message: 'The server did not return JSON.' };
  }
  const data = (parsed as { data?: IntrospectionQuery } | null)?.data;
  if (!data?.__schema) {
    return { ok: false, message: 'The response contains no introspection data (introspection may be disabled).' };
  }
  try {
    return { ok: true, schema: summarizeSchema(data) };
  } catch (error) {
    return { ok: false, message: describeParseFailure(error) };
  }
}
