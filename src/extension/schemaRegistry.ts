export interface SchemaRegistryConfig {
  url: string;
  username?: string;
  password?: string;
}

export type RegisteredSchemaType = 'AVRO' | 'JSON' | 'PROTOBUF';

export interface SchemaReference {
  name: string;
  subject: string;
  version: number;
}

export interface RegisteredSchema {
  schema: string;
  schemaType: RegisteredSchemaType;
  references?: SchemaReference[];
}

const REQUEST_TIMEOUT_MS = 5000;

function authorizationHeader({ username, password }: SchemaRegistryConfig): Record<string, string> {
  return username ? { Authorization: `Basic ${Buffer.from(`${username}:${password ?? ''}`).toString('base64')}` } : {};
}

function schemaUrl(config: SchemaRegistryConfig, schemaId: number): string {
  return `${config.url.trim().replace(/\/+$/, '')}/schemas/ids/${schemaId}`;
}

async function getJson<Body>(config: SchemaRegistryConfig, url: string, failure: string, fetchImpl: typeof fetch): Promise<Body> {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/vnd.schemaregistry.v1+json', ...authorizationHeader(config) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Schema Registry returned ${response.status} for ${failure}`);
  }
  return (await response.json()) as Body;
}

function toRegisteredSchema(body: { schema: string; schemaType?: RegisteredSchemaType; references?: SchemaReference[] }): RegisteredSchema {
  return { schema: body.schema, schemaType: body.schemaType ?? 'AVRO', ...(body.references?.length && { references: body.references }) };
}

export async function fetchSchemaById(config: SchemaRegistryConfig, schemaId: number, fetchImpl: typeof fetch = fetch): Promise<RegisteredSchema> {
  return toRegisteredSchema(await getJson(config, schemaUrl(config, schemaId), `schema ${schemaId}`, fetchImpl));
}

export async function fetchSubjectVersion(config: SchemaRegistryConfig, { subject, version }: SchemaReference, fetchImpl: typeof fetch = fetch): Promise<RegisteredSchema> {
  const url = `${config.url.trim().replace(/\/+$/, '')}/subjects/${encodeURIComponent(subject)}/versions/${version}`;
  return toRegisteredSchema(await getJson(config, url, `subject ${subject} version ${version}`, fetchImpl));
}
