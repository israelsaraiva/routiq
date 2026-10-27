export interface ScriptTranslation {
  code: string;
  untranslatedLines: number;
  commentedOutEntirely: boolean;
}

interface Rewrite {
  pattern: RegExp;
  replacement: string;
}

const UNTRANSLATED_PREFIX = '// [not translated] ';
const REMAINING_POSTMAN_API = /\bpm\.|\bpostman\.|\btests\[|\bresponseBody\b|\bresponseCode\b|\.to\.|\.be\.|\.have\./;

const VARIABLE_SCOPES = 'environment|variables|collectionVariables|globals';

const API_REWRITES: Rewrite[] = [
  { pattern: new RegExp(`\\bpm\\.(?:${VARIABLE_SCOPES})\\.set\\(`, 'g'), replacement: 'rq.variables.set(' },
  { pattern: new RegExp(`\\bpm\\.(?:${VARIABLE_SCOPES})\\.get\\(`, 'g'), replacement: 'rq.variables.get(' },
  { pattern: /\bpostman\.set(?:Environment|Global)Variable\(/g, replacement: 'rq.variables.set(' },
  { pattern: /\bpostman\.get(?:Environment|Global)Variable\(/g, replacement: 'rq.variables.get(' },
  { pattern: /\bpm\.response\.code\b/g, replacement: 'rq.response.status' },
  { pattern: /\bpm\.response\.status\b(?!\()/g, replacement: 'rq.response.statusText' },
  { pattern: /\bpm\.response\.responseTime\b/g, replacement: 'rq.response.timeMs' },
  { pattern: /\bpm\.response\.json\(\)/g, replacement: 'rq.response.json()' },
  { pattern: /\bpm\.response\.text\(\)/g, replacement: 'rq.response.text()' },
  { pattern: /\bpm\.response\.headers\.get\(/g, replacement: 'rq.response.header(' },
  { pattern: /\bpm\.test\(/g, replacement: 'rq.test(' },
  { pattern: /\bpm\.expect\(/g, replacement: 'rq.expect(' },
  { pattern: /\bpm\.response\.to\.have\.status\(([^)]*)\)/g, replacement: 'rq.expect(rq.response.status).toBe($1)' },
];

const NEGATION_NORMALIZATION: Rewrite = { pattern: /\.to\.not\./g, replacement: '.not.to.' };

const ASSERTION_REWRITES: Rewrite[] = [
  { pattern: /\.to\.deep\.(?:equal|equals)\(/g, replacement: '.toEqual(' },
  { pattern: /\.to\.(?:be\.)?(?:equal|equals)\(/g, replacement: '.toBe(' },
  { pattern: /\.to\.(?:be\.)?(?:eql|eqls)\(/g, replacement: '.toEqual(' },
  { pattern: /\.to\.(?:include|includes|contain|contains)\(/g, replacement: '.toContain(' },
  { pattern: /\.to\.have\.string\(/g, replacement: '.toContain(' },
  { pattern: /\.to\.be\.(?:above|greaterThan)\(/g, replacement: '.toBeGreaterThan(' },
  { pattern: /\.to\.be\.(?:below|lessThan)\(/g, replacement: '.toBeLessThan(' },
  { pattern: /\.to\.be\.at\.least\(/g, replacement: '.toBeGreaterThanOrEqual(' },
  { pattern: /\.to\.be\.at\.most\(/g, replacement: '.toBeLessThanOrEqual(' },
  { pattern: /\.to\.have\.(?:length|lengthOf)\(/g, replacement: '.toHaveLength(' },
  { pattern: /\.to\.have\.property\(/g, replacement: '.toHaveProperty(' },
  { pattern: /\.to\.match\(/g, replacement: '.toMatch(' },
  { pattern: /\.to\.be\.true\b/g, replacement: '.toBe(true)' },
  { pattern: /\.to\.be\.false\b/g, replacement: '.toBe(false)' },
  { pattern: /\.to\.be\.null\b/g, replacement: '.toBeNull()' },
  { pattern: /\.to\.be\.undefined\b/g, replacement: '.toBeUndefined()' },
  { pattern: /\.to\.be\.ok\b/g, replacement: '.toBeTruthy()' },
  { pattern: /\.to\.exist\b/g, replacement: '.toBeDefined()' },
];

function applyRewrites(line: string, rewrites: Rewrite[]): string {
  return rewrites.reduce((current, { pattern, replacement }) => current.replace(pattern, replacement), line);
}

function translateLine(line: string): string {
  return applyRewrites(applyRewrites(applyRewrites(line, API_REWRITES), [NEGATION_NORMALIZATION]), ASSERTION_REWRITES);
}

function isTranslatable(translatedLine: string): boolean {
  return !REMAINING_POSTMAN_API.test(translatedLine);
}

function commentOut(line: string): string {
  return `${UNTRANSLATED_PREFIX}${line}`;
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function compiles(code: string): boolean {
  try {
    new Function(code);
    return true;
  } catch {
    return false;
  }
}

function translateEachLine(lines: string[]): { code: string; untranslatedLines: number } {
  let untranslatedLines = 0;
  const translated = lines.map((line) => {
    const candidate = translateLine(line);
    if (isTranslatable(candidate)) {
      return candidate;
    }
    untranslatedLines += 1;
    return commentOut(line);
  });
  return { code: translated.join('\n'), untranslatedLines };
}

export function translatePostmanScript(source: string): ScriptTranslation {
  const lines = source.split(/\r?\n/);
  const attempt = translateEachLine(lines);
  if (compiles(attempt.code)) {
    return { ...attempt, commentedOutEntirely: false };
  }
  const significant = lines.filter((line) => !isBlank(line)).length;
  return { code: lines.map(commentOut).join('\n'), untranslatedLines: significant, commentedOutEntirely: true };
}
