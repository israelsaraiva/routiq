export interface SchemaRegistryConfig {
  url: string;
  username?: string;
  password?: string;
}

export type RegisteredSchemaType = 'AVRO' | 'JSON' | 'PROTOBUF';

export interface RegisteredSchema {
  schema: string;
  schemaType: RegisteredSchemaType;
}

const REQUEST_TIMEOUT_MS = 5000;

function authorizationHeader({ username, password }: SchemaRegistryConfig): Record<string, string> {
  return username ? { Authorization: `Basic ${Buffer.from(`${username}:${password ?? ''}`).toString('base64')}` } : {};
}

function schemaUrl(config: SchemaRegistryConfig, schemaId: number): string {
  return `${config.url.trim().replace(/\/+$/, '')}/schemas/ids/${schemaId}`;
}

export async function fetchSchemaById(config: SchemaRegistryConfig, schemaId: number, fetchImpl: typeof fetch = fetch): Promise<RegisteredSchema> {
  const response = await fetchImpl(schemaUrl(config, schemaId), {
    headers: { Accept: 'application/vnd.schemaregistry.v1+json', ...authorizationHeader(config) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Schema Registry returned ${response.status} for schema ${schemaId}`);
  }
  const body = (await response.json()) as { schema: string; schemaType?: RegisteredSchemaType };
  return { schema: body.schema, schemaType: body.schemaType ?? 'AVRO' };
}
