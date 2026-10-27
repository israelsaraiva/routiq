import { SseEvent } from '../shared/types';

const DEFAULT_EVENT_NAME = 'message';
const LINE_BREAK_PATTERN = /\r\n|\r|\n/;

interface PendingEvent {
  event: string;
  dataLines: string[];
  id?: string;
  retry?: number;
}

export interface SseParser {
  push(chunk: string): SseEvent[];
  flush(): SseEvent[];
}

function emptyPending(): PendingEvent {
  return { event: '', dataLines: [] };
}

function splitField(line: string): [string, string] {
  const separator = line.indexOf(':');
  if (separator === -1) {
    return [line, ''];
  }
  const value = line.slice(separator + 1);
  return [line.slice(0, separator), value.startsWith(' ') ? value.slice(1) : value];
}

function applyField(pending: PendingEvent, name: string, value: string): void {
  if (name === 'event') {
    pending.event = value;
  } else if (name === 'data') {
    pending.dataLines.push(value);
  } else if (name === 'id' && !value.includes('\0')) {
    pending.id = value;
  } else if (name === 'retry' && /^\d+$/.test(value)) {
    pending.retry = Number(value);
  }
}

function hasContent(pending: PendingEvent): boolean {
  return pending.dataLines.length > 0 || pending.retry !== undefined || pending.id !== undefined || pending.event !== '';
}

function toEvent(pending: PendingEvent): SseEvent {
  const event: SseEvent = { event: pending.event || DEFAULT_EVENT_NAME, data: pending.dataLines.join('\n') };
  if (pending.id !== undefined) {
    event.id = pending.id;
  }
  if (pending.retry !== undefined) {
    event.retry = pending.retry;
  }
  return event;
}

export function createSseParser(): SseParser {
  let buffer = '';
  let pending = emptyPending();

  function consumeLine(line: string, events: SseEvent[]): void {
    if (line === '') {
      if (hasContent(pending)) {
        events.push(toEvent(pending));
      }
      pending = emptyPending();
      return;
    }
    if (line.startsWith(':')) {
      return;
    }
    const [name, value] = splitField(line);
    applyField(pending, name, value);
  }

  function drainCompleteLines(events: SseEvent[]): void {
    let match = LINE_BREAK_PATTERN.exec(buffer);
    while (match) {
      const endsWithBareCarriageReturn = match[0] === '\r' && match.index + 1 === buffer.length;
      if (endsWithBareCarriageReturn) {
        return;
      }
      consumeLine(buffer.slice(0, match.index), events);
      buffer = buffer.slice(match.index + match[0].length);
      match = LINE_BREAK_PATTERN.exec(buffer);
    }
  }

  return {
    push(chunk: string): SseEvent[] {
      const events: SseEvent[] = [];
      buffer += chunk;
      drainCompleteLines(events);
      return events;
    },
    flush(): SseEvent[] {
      const events: SseEvent[] = [];
      if (buffer.endsWith('\r')) {
        consumeLine(buffer.slice(0, -1), events);
      }
      buffer = '';
      pending = emptyPending();
      return events;
    },
  };
}
