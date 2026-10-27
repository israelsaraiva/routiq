import { KafkaHighlightRule, KafkaMessageFilter, KafkaRuleMatchType } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';
import { generateId } from '../ids';
import { EMPTY_FILTER, compileFilter } from './messageFilter';

export const RULE_COLORS = ['#e5534b', '#d29922', '#3fb950', '#58a6ff', '#bc8cff'];
const MATCH_TYPES: KafkaRuleMatchType[] = ['text', 'regex', 'jsonpath'];

export const DEFAULT_RULES: KafkaHighlightRule[] = [
  {
    id: 'default-errors',
    name: 'Errors',
    matchType: 'regex',
    pattern: 'error|exception',
    color: RULE_COLORS[0],
    notify: false,
    badge: true,
    enabled: true,
  },
];

export function createRule(newId: () => string = generateId): KafkaHighlightRule {
  return { id: newId(), name: 'New rule', matchType: 'text', pattern: '', color: RULE_COLORS[1], notify: false, badge: true, enabled: true };
}

function ruleFilter({ matchType, pattern }: KafkaHighlightRule): KafkaMessageFilter {
  return {
    ...EMPTY_FILTER,
    text: matchType === 'jsonpath' ? '' : pattern,
    regex: matchType === 'regex',
    jsonPath: matchType === 'jsonpath' ? pattern : '',
  };
}

export function ruleMatcher(rule: KafkaHighlightRule): (message: KafkaMessage) => boolean {
  const { matches, error } = compileFilter(ruleFilter(rule));
  return rule.enabled && rule.pattern.trim() && !error ? matches : () => false;
}

export function validateRule(rule: KafkaHighlightRule): string | undefined {
  if (!rule.name.trim()) {
    return 'Rule name is required';
  }
  return rule.pattern.trim() ? compileFilter(ruleFilter(rule)).error : 'Pattern is required';
}

export function matchingRules(rules: KafkaHighlightRule[], message: KafkaMessage): KafkaHighlightRule[] {
  return rules.filter((rule) => ruleMatcher(rule)(message));
}

export function countRuleHits(rules: KafkaHighlightRule[], messages: KafkaMessage[]): Record<string, number> {
  return Object.fromEntries(
    rules.map((rule) => {
      const matches = ruleMatcher(rule);
      return [rule.id, messages.filter(matches).length];
    }),
  );
}

export function normalizeRules(stored: unknown): KafkaHighlightRule[] {
  if (!Array.isArray(stored)) {
    return DEFAULT_RULES;
  }
  return stored.filter(isStoredRule).map((rule) => ({
    ...createRule(() => rule.id),
    ...rule,
    matchType: MATCH_TYPES.includes(rule.matchType) ? rule.matchType : 'text',
  }));
}

function isStoredRule(value: unknown): value is KafkaHighlightRule {
  const candidate = value as Partial<KafkaHighlightRule> | null;
  return typeof candidate?.id === 'string' && typeof candidate.name === 'string' && typeof candidate.pattern === 'string';
}
