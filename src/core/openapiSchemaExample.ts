import { Json, isObject } from './jsonValues';

const MAX_DEPTH = 6;

const FORMAT_EXAMPLES: Record<string, string> = {
  'date-time': '2024-01-01T00:00:00Z',
  date: '2024-01-01',
  email: 'user@example.com',
  uuid: '00000000-0000-0000-0000-000000000000',
  uri: 'https://example.com',
  url: 'https://example.com',
  hostname: 'example.com',
  ipv4: '127.0.0.1',
  byte: 'ZXhhbXBsZQ==',
  password: 'password',
};

export type RefResolver = (schema: Json) => Json;

export function createRefResolver(root: Json): RefResolver {
  const resolve = (node: Json, visited: Set<string>): Json => {
    const reference = node.$ref;
    if (typeof reference !== 'string' || !reference.startsWith('#/') || visited.has(reference)) {
      return node;
    }
    const target = lookupPointer(root, reference);
    return isObject(target) ? resolve(target, new Set(visited).add(reference)) : node;
  };
  return (node) => resolve(node, new Set());
}

function lookupPointer(root: Json, reference: string): unknown {
  return reference
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((current, segment) => (isObject(current) ? current[segment] : undefined), root);
}

function inferType(schema: Json): string {
  if (typeof schema.type === 'string') {
    return schema.type;
  }
  if (Array.isArray(schema.type)) {
    return schema.type.find((type: unknown) => type !== 'null') ?? 'null';
  }
  if (isObject(schema.properties)) {
    return 'object';
  }
  return schema.items ? 'array' : 'string';
}

function primitiveExample(type: string, schema: Json): unknown {
  if (type === 'integer') {
    return schema.minimum ?? 0;
  }
  if (type === 'number') {
    return schema.minimum ?? 0;
  }
  if (type === 'boolean') {
    return true;
  }
  if (type === 'null') {
    return null;
  }
  return FORMAT_EXAMPLES[schema.format] ?? 'string';
}

function mergeAllOf(schema: Json, resolve: RefResolver): Json {
  const parts = (schema.allOf as unknown[]).filter(isObject).map(resolve);
  const { allOf: _allOf, ...own } = schema;
  return parts.reduce<Json>(
    (merged, part) => ({ ...merged, ...part, properties: { ...merged.properties, ...part.properties } }),
    own,
  );
}

function firstAlternative(schema: Json, resolve: RefResolver): Json | undefined {
  const alternatives = schema.oneOf ?? schema.anyOf;
  return Array.isArray(alternatives) ? alternatives.filter(isObject).map(resolve)[0] : undefined;
}

function objectExample(schema: Json, resolve: RefResolver, depth: number): Json {
  const properties = isObject(schema.properties) ? schema.properties : {};
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, property]) => isObject(property) && property.readOnly !== true)
      .map(([name, property]) => [name, exampleValue(property, resolve, depth + 1)]),
  );
}

export function exampleValue(rawSchema: unknown, resolve: RefResolver, depth = 0): unknown {
  if (!isObject(rawSchema) || depth > MAX_DEPTH) {
    return null;
  }
  const schema = resolve(rawSchema);
  if (schema.example !== undefined) {
    return schema.example;
  }
  if (schema.default !== undefined) {
    return schema.default;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  if (Array.isArray(schema.allOf)) {
    return exampleValue(mergeAllOf(schema, resolve), resolve, depth + 1);
  }
  const alternative = firstAlternative(schema, resolve);
  if (alternative) {
    return exampleValue(alternative, resolve, depth + 1);
  }
  const type = inferType(schema);
  if (type === 'object') {
    return objectExample(schema, resolve, depth);
  }
  if (type === 'array') {
    return [exampleValue(schema.items, resolve, depth + 1)];
  }
  return primitiveExample(type, schema);
}
