import { parse, print } from 'graphql';

export type PrettifyResult = { ok: true; text: string } | { ok: false; message: string };

export function prettifyQuery(document: string): PrettifyResult {
  if (document.trim() === '') {
    return { ok: true, text: document };
  }
  try {
    return { ok: true, text: print(parse(document)) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function prettifyVariables(text: string): PrettifyResult {
  if (text.trim() === '') {
    return { ok: true, text };
  }
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(text), null, 2) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
