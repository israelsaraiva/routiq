import { parseHeadersJson } from './connection';

export interface HeaderRow {
  name: string;
  value: string;
}

export function headersToRows(headers: Record<string, string>): HeaderRow[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

export function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((row) => row.name.trim() !== '').map((row) => [row.name.trim(), row.value]));
}

export function rowsFromText(text: string): HeaderRow[] {
  return headersToRows(parseHeadersJson(text).headers);
}

export function headersTextFromRows(rows: HeaderRow[]): string {
  const headers = rowsToHeaders(rows);
  return Object.keys(headers).length > 0 ? JSON.stringify(headers, null, 2) : '';
}
