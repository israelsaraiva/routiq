import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { PreparedRequest } from '../core/requestBuilder';

const CONTENT_TYPE = 'content-type';

export interface FetchPayload {
  body?: string | Buffer | FormData;
  headers: Record<string, string>;
}

function withoutContentType(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== CONTENT_TYPE));
}

async function buildFormData(parts: NonNullable<PreparedRequest['multipart']>): Promise<FormData> {
  const form = new FormData();
  for (const part of parts) {
    if (part.kind === 'text') {
      form.append(part.name, part.value);
    } else {
      form.append(part.name, new Blob([await readFile(part.filePath)]), basename(part.filePath));
    }
  }
  return form;
}

export async function buildPayload(prepared: PreparedRequest): Promise<FetchPayload> {
  if (prepared.multipart) {
    return { body: await buildFormData(prepared.multipart), headers: withoutContentType(prepared.headers) };
  }
  if (prepared.bodyFilePath) {
    return { body: await readFile(prepared.bodyFilePath), headers: prepared.headers };
  }
  return { body: prepared.body, headers: prepared.headers };
}
