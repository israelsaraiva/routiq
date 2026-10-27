export interface GraphqlErrorLocation {
  line: number;
  column: number;
}

export interface GraphqlError {
  message: string;
  path?: string;
  locations: GraphqlErrorLocation[];
  code?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toLocations(value: unknown): GraphqlErrorLocation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .filter((entry) => typeof entry.line === 'number' && typeof entry.column === 'number')
    .map((entry) => ({ line: entry.line as number, column: entry.column as number }));
}

function toPath(value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 ? value.map(String).join('.') : undefined;
}

function toCode(value: unknown): string | undefined {
  return isRecord(value) && typeof value.code === 'string' ? value.code : undefined;
}

function toError(entry: unknown): GraphqlError {
  if (!isRecord(entry)) {
    return { message: String(entry), locations: [] };
  }
  const path = toPath(entry.path);
  const code = toCode(entry.extensions);
  return {
    message: typeof entry.message === 'string' ? entry.message : JSON.stringify(entry),
    ...(path ? { path } : {}),
    locations: toLocations(entry.locations),
    ...(code ? { code } : {}),
  };
}

export function extractGraphqlErrors(responseBody: string): GraphqlError[] {
  try {
    const parsed: unknown = JSON.parse(responseBody);
    return isRecord(parsed) && Array.isArray(parsed.errors) ? parsed.errors.map(toError) : [];
  } catch {
    return [];
  }
}

export function formatErrorLocation(location: GraphqlErrorLocation): string {
  return `${location.line}:${location.column}`;
}
