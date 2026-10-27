import { GrpcMethodDescription, GrpcServiceDescription } from '../shared/types';

export interface ProtoField {
  name: string;
  label: string;
  type: string;
  typeName: string;
}

export interface ProtoMessageType {
  field?: ProtoField[];
  nestedType?: Array<ProtoMessageType & { name: string }>;
  options?: { mapEntry?: boolean } | null;
}

export interface ProtoEnumType {
  value: Array<{ name: string }>;
}

export interface ProtoMessageDefinition {
  type: ProtoMessageType | ProtoEnumType;
}

export interface ProtoMethodDefinition {
  path: string;
  requestStream: boolean;
  responseStream: boolean;
  requestType: ProtoMessageDefinition;
}

export type ProtoDefinitionEntry = Record<string, ProtoMethodDefinition> | ProtoMessageDefinition;

export type ProtoDefinitions = Record<string, ProtoDefinitionEntry>;

const MAX_SKELETON_DEPTH = 6;
const REPEATED_LABEL = 'LABEL_REPEATED';
const MESSAGE_TYPES = new Set(['TYPE_MESSAGE', 'TYPE_GROUP']);
const INTEGER_TYPES = new Set([
  'TYPE_INT32', 'TYPE_UINT32', 'TYPE_SINT32', 'TYPE_FIXED32', 'TYPE_SFIXED32',
  'TYPE_INT64', 'TYPE_UINT64', 'TYPE_SINT64', 'TYPE_FIXED64', 'TYPE_SFIXED64',
]);
const FLOATING_TYPES = new Set(['TYPE_DOUBLE', 'TYPE_FLOAT']);

function isMethodTable(entry: ProtoDefinitionEntry): entry is Record<string, ProtoMethodDefinition> {
  return !('type' in entry && typeof entry.type === 'object');
}

function isEnumType(type: ProtoMessageType | ProtoEnumType): type is ProtoEnumType {
  return 'value' in type;
}

function isMessageDefinition(entry: ProtoDefinitionEntry | undefined): entry is ProtoMessageDefinition {
  return entry !== undefined && !isMethodTable(entry);
}

function normalizeTypeName(typeName: string): string {
  return typeName.replace(/^\./, '');
}

function findDefinition(definitions: ProtoDefinitions, typeName: string, ownerName: string): ProtoMessageDefinition | undefined {
  const name = normalizeTypeName(typeName);
  const packagePrefix = ownerName.includes('.') ? ownerName.slice(0, ownerName.lastIndexOf('.') + 1) : '';
  const candidates = [name, `${packagePrefix}${name}`, ...Object.keys(definitions).filter((key) => key.endsWith(`.${name}`))];
  const key = candidates.find((candidate) => isMessageDefinition(definitions[candidate]));
  const entry = key === undefined ? undefined : definitions[key];
  return isMessageDefinition(entry) ? entry : undefined;
}

function scalarExample(type: string): unknown {
  if (type === 'TYPE_STRING') {
    return '';
  }
  if (type === 'TYPE_BOOL') {
    return false;
  }
  if (type === 'TYPE_BYTES') {
    return '';
  }
  if (INTEGER_TYPES.has(type) || FLOATING_TYPES.has(type)) {
    return 0;
  }
  return null;
}

interface SkeletonContext {
  definitions: ProtoDefinitions;
  ownerName: string;
  nested: Map<string, ProtoMessageType>;
}

function isMapField(field: ProtoField, context: SkeletonContext): boolean {
  const entry = context.nested.get(normalizeTypeName(field.typeName).split('.').pop() ?? '');
  return field.label === REPEATED_LABEL && entry?.options?.mapEntry === true;
}

function enumExample(field: ProtoField, context: SkeletonContext): unknown {
  const definition = findDefinition(context.definitions, field.typeName, context.ownerName);
  const type = definition?.type;
  return type && isEnumType(type) ? (type.value[0]?.name ?? 0) : 0;
}

function messageExample(field: ProtoField, context: SkeletonContext, depth: number): unknown {
  const nestedType = context.nested.get(field.typeName);
  if (nestedType) {
    return skeletonOf(nestedType, { ...context, nested: nestedTypesOf(nestedType) }, depth + 1);
  }
  const definition = findDefinition(context.definitions, field.typeName, context.ownerName);
  if (!definition || isEnumType(definition.type)) {
    return {};
  }
  const ownerName = Object.keys(context.definitions).find((key) => context.definitions[key] === definition) ?? context.ownerName;
  return skeletonOf(definition.type, { definitions: context.definitions, ownerName, nested: nestedTypesOf(definition.type) }, depth + 1);
}

function fieldExample(field: ProtoField, context: SkeletonContext, depth: number): unknown {
  if (isMapField(field, context)) {
    return {};
  }
  const single =
    field.type === 'TYPE_ENUM'
      ? enumExample(field, context)
      : MESSAGE_TYPES.has(field.type)
        ? messageExample(field, context, depth)
        : scalarExample(field.type);
  return field.label === REPEATED_LABEL ? [] : single;
}

function nestedTypesOf(type: ProtoMessageType): Map<string, ProtoMessageType> {
  return new Map((type.nestedType ?? []).map((nested) => [nested.name, nested]));
}

function skeletonOf(type: ProtoMessageType, context: SkeletonContext, depth: number): Record<string, unknown> {
  if (depth > MAX_SKELETON_DEPTH) {
    return {};
  }
  return Object.fromEntries((type.field ?? []).map((field) => [field.name, fieldExample(field, context, depth)]));
}

export function exampleBodyFor(definitions: ProtoDefinitions, method: ProtoMethodDefinition, ownerName: string): string {
  const type = method.requestType.type;
  if (isEnumType(type)) {
    return '{}';
  }
  const context: SkeletonContext = { definitions, ownerName, nested: nestedTypesOf(type) };
  return JSON.stringify(skeletonOf(type, context, 0), null, 2);
}

function describeMethod(definitions: ProtoDefinitions, serviceName: string, name: string, method: ProtoMethodDefinition): GrpcMethodDescription {
  return {
    name,
    requestStream: method.requestStream,
    responseStream: method.responseStream,
    exampleBody: exampleBodyFor(definitions, method, serviceName),
  };
}

function isServiceTable(entry: ProtoDefinitionEntry): entry is Record<string, ProtoMethodDefinition> {
  return isMethodTable(entry) && Object.values(entry).every((method) => typeof method?.path === 'string');
}

export function describeServices(definitions: ProtoDefinitions): GrpcServiceDescription[] {
  return Object.entries(definitions)
    .filter((pair): pair is [string, Record<string, ProtoMethodDefinition>] => isServiceTable(pair[1]))
    .map(([serviceName, methods]) => ({
      name: serviceName,
      methods: Object.entries(methods).map(([name, method]) => describeMethod(definitions, serviceName, methodNameFromPath(method.path, name), method)),
    }));
}

export function methodNameFromPath(path: string, fallback: string): string {
  const name = path.split('/').pop();
  return name ? name : fallback;
}

export function findMethod(services: GrpcServiceDescription[], serviceName: string, methodName: string): GrpcMethodDescription | undefined {
  return services.find((service) => service.name === serviceName)?.methods.find((method) => method.name === methodName);
}
