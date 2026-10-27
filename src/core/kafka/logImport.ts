import { KafkaLogFile, KafkaMessage } from '../../shared/types';
import { importCsv, looksLikeRoutiqCsv } from './csvImport';
import { parseJsonFile } from './jsonLogParser';
import { messagesFromLogEntries } from './messageExport';

export interface LogImportResult {
  messages: KafkaMessage[];
  error: string | null;
}

export function isCsvLogFile(logFile: KafkaLogFile): boolean {
  return /\.csv$/i.test(logFile.name) || looksLikeRoutiqCsv(logFile.text);
}

export function importLogFile(logFile: KafkaLogFile): LogImportResult {
  if (isCsvLogFile(logFile)) {
    return importCsv(logFile.text);
  }
  const { entries, error } = parseJsonFile(logFile.text);
  return { messages: messagesFromLogEntries(entries), error };
}
