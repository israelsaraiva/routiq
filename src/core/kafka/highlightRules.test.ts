import { describe, expect, it } from 'vitest';
import { KafkaHighlightRule } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';
import { DEFAULT_RULES, countRuleHits, createRule, matchingRules, normalizeRules, validateRule } from './highlightRules';

const message = (value: string): KafkaMessage => ({ id: value, flowId: 'f', timestamp: 1, topic: 't', partition: 0, offset: '0', key: null, value });
const rule = (patch: Partial<KafkaHighlightRule>): KafkaHighlightRule => ({ ...createRule(() => 'r'), pattern: 'x', ...patch });

describe('highlight rules', () => {
  it('ships an error/exception example rule', () => {
    expect(matchingRules(DEFAULT_RULES, message('NullPointerException'))).toHaveLength(1);
    expect(matchingRules(DEFAULT_RULES, message('all good'))).toHaveLength(0);
  });

  it('matches by text, regex and json path', () => {
    expect(matchingRules([rule({ matchType: 'text', pattern: 'PAID' })], message('{"s":"paid"}'))).toHaveLength(1);
    expect(matchingRules([rule({ matchType: 'regex', pattern: '^\\{"s"' })], message('{"s":1}'))).toHaveLength(1);
    expect(matchingRules([rule({ matchType: 'jsonpath', pattern: "$.s == 'A'" })], message('{"s":"A"}'))).toHaveLength(1);
    expect(matchingRules([rule({ matchType: 'jsonpath', pattern: "$.s == 'A'" })], message('{"s":"B"}'))).toHaveLength(0);
  });

  it('skips disabled, empty and invalid rules', () => {
    const rules = [rule({ enabled: false }), rule({ pattern: '' }), rule({ matchType: 'regex', pattern: '(' })];
    expect(matchingRules(rules, message('x'))).toHaveLength(0);
  });

  it('counts hits per rule', () => {
    const rules = [rule({ id: 'a', pattern: 'a' }), rule({ id: 'b', pattern: 'zzz' })];
    expect(countRuleHits(rules, [message('a1'), message('a2'), message('c')])).toEqual({ a: 2, b: 0 });
  });

  it('validates rules', () => {
    expect(validateRule(rule({ pattern: '' }))).toBe('Pattern is required');
    expect(validateRule(rule({ matchType: 'regex', pattern: '(' }))).toBeDefined();
    expect(validateRule(rule({}))).toBeUndefined();
  });

  it('falls back to the default rules when nothing is stored', () => {
    expect(normalizeRules(undefined)).toEqual(DEFAULT_RULES);
    expect(normalizeRules([{ id: '1', name: 'n', pattern: 'p', matchType: 'bogus' }])[0].matchType).toBe('text');
  });
});
