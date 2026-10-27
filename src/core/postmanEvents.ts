import { RequestScripts } from '../shared/types';
import { Json, isObject } from './jsonValues';
import { ImportWarnings } from './importReport';
import { translatePostmanScript } from './postmanScript';

type Listen = 'prerequest' | 'test';

const LISTEN_LABELS: Record<Listen, string> = { prerequest: 'pre-request script', test: 'test script' };

function execLines(exec: unknown): string[] {
  if (Array.isArray(exec)) {
    return exec.map(String);
  }
  return typeof exec === 'string' ? [exec] : [];
}

function sourceFor(events: Json[], listen: Listen): string {
  return events
    .filter((event) => event.listen === listen && event.disabled !== true && isObject(event.script))
    .map((event) => execLines(event.script.exec).join('\n'))
    .filter((source) => source.trim() !== '')
    .join('\n');
}

function warningFor(requestName: string, listen: Listen, untranslatedLines: number, entirely: boolean): string {
  const label = LISTEN_LABELS[listen];
  if (entirely) {
    return `"${requestName}": ${label} could not be translated reliably and was kept as commented-out text.`;
  }
  return `"${requestName}": ${untranslatedLines} line(s) of the ${label} could not be translated and were commented out.`;
}

function translateListen(events: Json[], listen: Listen, requestName: string, warnings: ImportWarnings): string {
  const source = sourceFor(events, listen);
  if (source === '') {
    return '';
  }
  const translation = translatePostmanScript(source);
  if (translation.untranslatedLines > 0) {
    warnings.push(warningFor(requestName, listen, translation.untranslatedLines, translation.commentedOutEntirely));
  }
  return translation.code;
}

export function translatePostmanEvents(events: unknown, requestName: string, warnings: ImportWarnings): RequestScripts | undefined {
  const list = Array.isArray(events) ? events.filter(isObject) : [];
  const pre = translateListen(list, 'prerequest', requestName, warnings);
  const post = translateListen(list, 'test', requestName, warnings);
  return pre === '' && post === '' ? undefined : { pre, post };
}
