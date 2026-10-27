export interface JsonLogEntry {
  preview?: boolean;
  result: Record<string, unknown>;
}

export interface NdjsonResult {
  entries: JsonLogEntry[];
  errors: string[];
}

export interface JsonFileResult {
  entries: JsonLogEntry[];
  error: string | null;
}

function isEntryObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

function toEntries(parsed: unknown): JsonLogEntry[] | null {
  if (Array.isArray(parsed)) {
    return parsed as JsonLogEntry[];
  }
  return isEntryObject(parsed) ? [parsed as JsonLogEntry] : null;
}

export function parseSingleJson(text: string): JsonLogEntry[] | null {
  try {
    return toEntries(JSON.parse(text));
  } catch {
    return null;
  }
}

class NestingTracker {
  private braces = 0;
  private brackets = 0;
  private inString = false;
  private escaped = false;

  get isBalanced(): boolean {
    return this.braces === 0 && this.brackets === 0;
  }

  scan(line: string): void {
    for (const char of line) {
      this.consume(char);
    }
  }

  reset(): void {
    this.braces = 0;
    this.brackets = 0;
    this.inString = false;
    this.escaped = false;
  }

  private consume(char: string): void {
    if (this.escaped) {
      this.escaped = false;
    } else if (char === '\\') {
      this.escaped = true;
    } else if (char === '"') {
      this.inString = !this.inString;
    } else if (!this.inString) {
      this.countStructure(char);
    }
  }

  private countStructure(char: string): void {
    this.braces += char === '{' ? 1 : char === '}' ? -1 : 0;
    this.brackets += char === '[' ? 1 : char === ']' ? -1 : 0;
  }
}

function describeParseError(error: unknown): string {
  return error instanceof Error ? error.message : 'Parse error';
}

export function parseNdjson(text: string): NdjsonResult {
  const entries: JsonLogEntry[] = [];
  const errors: string[] = [];
  const tracker = new NestingTracker();
  let pending = '';

  const flush = (label: string, reportInvalidShape: boolean): void => {
    try {
      const parsed = toEntries(JSON.parse(pending.trim()));
      parsed ? entries.push(...parsed) : reportInvalidShape && errors.push(`${label}: Invalid JSON format`);
    } catch (error) {
      errors.push(label === 'Final entry' ? 'Final entry: Parse error' : `${label}: ${describeParseError(error)}`);
    }
    pending = '';
    tracker.reset();
  };

  text.split('\n').forEach((line, index) => {
    if (!line.trim() && !pending.trim()) {
      return;
    }
    pending += (pending ? '\n' : '') + line;
    tracker.scan(line);
    tracker.isBalanced && pending.trim() && flush(`Line ${index + 1}`, true);
  });
  pending.trim() && tracker.isBalanced && flush('Final entry', false);
  return { entries, errors };
}

export function parseJsonFile(text: string): JsonFileResult {
  if (!text || text.trim().length === 0) {
    return { entries: [], error: 'File is empty' };
  }
  const single = parseSingleJson(text);
  if (single) {
    return { entries: single, error: null };
  }
  const { entries, errors } = parseNdjson(text);
  if (entries.length === 0) {
    return { entries: [], error: 'Failed to parse any JSON entries' };
  }
  const error = errors.length > 0 ? `Parsed ${entries.length} entries with ${errors.length} error(s). First error: ${errors[0]}` : null;
  return { entries, error };
}
