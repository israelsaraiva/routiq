export type HighlightKind = 'fail' | 'flowId' | 'commandId';

export interface HighlightSegment {
  text: string;
  kind?: HighlightKind;
}

const HIGHLIGHT_PATTERN = /(fail|flowId|commandId)/gi;
const KIND_BY_KEYWORD: Record<string, HighlightKind> = { fail: 'fail', flowid: 'flowId', commandid: 'commandId' };

export function splitHighlights(text: string): HighlightSegment[] {
  return text
    .split(HIGHLIGHT_PATTERN)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, kind: KIND_BY_KEYWORD[part.toLowerCase()] }));
}
