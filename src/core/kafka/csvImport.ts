import { KafkaMessage } from '../../shared/types';
import { CSV_COLUMNS, ExportedRecord, importExportedRecord } from './messageExport';

export interface CsvImportResult {
  messages: KafkaMessage[];
  error: string | null;
}

const REQUIRED_COLUMNS = ['topic', 'partition', 'offset'] as const;
const BOM = '\uFEFF';

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      endCell();
    } else if (char === '\n' || char === '\r') {
      char === '\r' && text[index + 1] === '\n' && index++;
      endRow();
    } else {
      cell += char;
    }
  }
  (cell !== '' || row.length > 0) && endRow();
  return rows.filter((candidate) => candidate.length > 1 || candidate[0] !== '');
}

export function looksLikeRoutiqCsv(text: string): boolean {
  return text.replace(BOM, '').trimStart().startsWith(`${REQUIRED_COLUMNS.join(',')},`);
}

function parseHeaders(text: string): Record<string, string> {
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function optionalNumber(text: string): number | null {
  const parsed = Number(text);
  return text !== '' && Number.isFinite(parsed) ? parsed : null;
}

function toExportedRecord(cells: Record<string, string>): ExportedRecord {
  return {
    topic: cells.topic,
    partition: Number(cells.partition),
    offset: cells.offset,
    key: cells.key === '' || cells.key === undefined ? null : cells.key,
    headers: parseHeaders(cells.headers ?? ''),
    value: cells.tombstone === 'true' ? null : (cells.value ?? ''),
    timestamp: optionalNumber(cells.timestamp ?? ''),
    timestampIso: cells.timestampIso || null,
    receivedAt: optionalNumber(cells.receivedAt ?? '') ?? 0,
    receivedAtIso: cells.receivedAtIso ?? '',
  };
}

function rowToCells(columns: string[], row: string[]): Record<string, string> {
  return Object.fromEntries(columns.map((column, index) => [column, row[index] ?? '']));
}

export function importCsv(text: string): CsvImportResult {
  const [columns, ...rows] = parseCsvRows(text.replace(BOM, ''));
  const missing = REQUIRED_COLUMNS.filter((column) => !columns?.includes(column));
  if (!columns || missing.length > 0) {
    return { messages: [], error: `Not a Routiq CSV export (missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ') || CSV_COLUMNS.join(', ')})` };
  }
  const records = rows.map((row) => toExportedRecord(rowToCells(columns, row)));
  const valid = records.filter((record) => Number.isInteger(record.partition) && record.topic !== '');
  const skipped = records.length - valid.length;
  return { messages: valid.map(importExportedRecord), error: skipped > 0 ? `Skipped ${skipped} malformed row(s)` : null };
}
