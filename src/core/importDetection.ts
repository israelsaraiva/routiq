import { Json, isObject } from './jsonValues';
import { parse as parseYaml } from 'yaml';
import { isInsomniaExport } from './insomnia';
import { isOpenApiDocument } from './openapi';
import { isPostmanEnvironment } from './postmanEnvironment';
import { isOwnCollectionFormat, isOwnExportFormat, isPostmanFormat } from './postman';

export type ImportDetection =
  | { kind: 'curl'; command: string }
  | { kind: 'routiq'; data: Json }
  | { kind: 'postman'; data: Json }
  | { kind: 'postman-environment'; data: Json }
  | { kind: 'openapi'; data: Json }
  | { kind: 'insomnia'; data: Json }
  | { kind: 'unrecognized'; reason: string };

const CURL_COMMAND_PATTERN = /^(\$\s*)?curl(\.exe)?(\s|$)/i;
const UNRECOGNIZED_TEXT_REASON =
  'Unrecognized content: expected a cURL command (starting with "curl"), a Routiq export (JSON) or a Postman v2.1 collection or environment (JSON), an Insomnia export (JSON) or an OpenAPI/Swagger document (JSON or YAML).';

const UNRECOGNIZED_JSON_REASON =
  'The JSON is neither a Routiq export, a Postman v2.1 collection, an Insomnia export nor an OpenAPI/Swagger document.';

function stripByteOrderMark(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function detectJson(trimmed: string): ImportDetection {
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: 'unrecognized', reason: `The text looks like JSON but is not valid JSON (${detail}).` };
  }
  if (!isObject(data)) {
    return { kind: 'unrecognized', reason: 'The JSON is not a Routiq export or a Postman v2.1 collection: expected a JSON object.' };
  }
  if (isOwnExportFormat(data) || isOwnCollectionFormat(data)) {
    return { kind: 'routiq', data };
  }
  return detectCollectionObject(data) ?? { kind: 'unrecognized', reason: UNRECOGNIZED_JSON_REASON };
}

function detectCollectionObject(data: Json): ImportDetection | undefined {
  if (isPostmanFormat(data)) {
    return { kind: 'postman', data };
  }
  if (isInsomniaExport(data)) {
    return { kind: 'insomnia', data };
  }
  if (isOpenApiDocument(data)) {
    return { kind: 'openapi', data };
  }
  return isPostmanEnvironment(data) ? { kind: 'postman-environment', data } : undefined;
}

function detectYaml(trimmed: string): ImportDetection {
  let data: unknown;
  try {
    data = parseYaml(trimmed);
  } catch {
    return { kind: 'unrecognized', reason: UNRECOGNIZED_TEXT_REASON };
  }
  const detection = isObject(data) ? detectCollectionObject(data) : undefined;
  return detection ?? { kind: 'unrecognized', reason: UNRECOGNIZED_TEXT_REASON };
}

export function detectImportFormat(text: string): ImportDetection {
  const trimmed = stripByteOrderMark(text).trim();
  if (trimmed === '') {
    return { kind: 'unrecognized', reason: 'There is nothing to import: the text is empty.' };
  }
  if (CURL_COMMAND_PATTERN.test(trimmed)) {
    return { kind: 'curl', command: trimmed };
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return detectJson(trimmed);
  }
  return detectYaml(trimmed);
}
