const CONSECUTIVE_BONUS = 5;
const WORD_START_BONUS = 8;
const PREFIX_BONUS = 15;
const GAP_PENALTY = 1;
const WORD_SEPARATORS = /[\s/\-_.:?&=]/;

function isWordStart(text: string, index: number): boolean {
  return index === 0 || WORD_SEPARATORS.test(text[index - 1]);
}

export function fuzzyScore(query: string, text: string): number | undefined {
  const needle = query.toLowerCase().replace(/\s+/g, '');
  const haystack = text.toLowerCase();
  let score = 0;
  let cursor = 0;
  let previousMatch = -2;
  for (const character of needle) {
    const matchIndex = haystack.indexOf(character, cursor);
    if (matchIndex === -1) {
      return undefined;
    }
    score += 1;
    score += matchIndex === previousMatch + 1 ? CONSECUTIVE_BONUS : 0;
    score += isWordStart(haystack, matchIndex) ? WORD_START_BONUS : 0;
    score += matchIndex === 0 && cursor === 0 ? PREFIX_BONUS : 0;
    score -= previousMatch >= 0 ? (matchIndex - previousMatch - 1) * GAP_PENALTY : 0;
    previousMatch = matchIndex;
    cursor = matchIndex + 1;
  }
  return score;
}

export function fuzzyMatches(query: string, text: string): boolean {
  return fuzzyScore(query, text) !== undefined;
}

export function fuzzyFilter<T>(items: T[], query: string, textOf: (item: T) => string): T[] {
  if (query.trim() === '') {
    return items;
  }
  return items
    .map((item, order) => ({ item, order, score: fuzzyScore(query, textOf(item)) }))
    .filter((ranked): ranked is { item: T; order: number; score: number } => ranked.score !== undefined)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map((ranked) => ranked.item);
}
