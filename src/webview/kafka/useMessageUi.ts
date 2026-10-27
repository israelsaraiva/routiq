import { useCallback, useEffect, useRef, useState } from 'react';
import { matchingRules } from '../../core/kafka/highlightRules';
import { defaultUiState } from '../../core/kafka/uiState';
import { KafkaHighlightRule, KafkaUiState } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';
import { postKafkaMessage } from '../vscodeApi';

const SAMPLE_LENGTH = 120;

export interface MessageUi {
  ui: KafkaUiState;
  update: (patch: Partial<KafkaUiState>) => void;
}

export function useMessageUi(hostUi: KafkaUiState | undefined): MessageUi {
  const [ui, setUi] = useState<KafkaUiState>(() => hostUi ?? defaultUiState());

  useEffect(() => {
    hostUi && setUi(hostUi);
  }, [hostUi]);

  const update = useCallback((patch: Partial<KafkaUiState>) => {
    setUi((current) => ({ ...current, ...patch }));
    postKafkaMessage({ type: 'kafkaSaveUiState', ui: patch });
  }, []);

  return { ui, update };
}

function notifyRuleHits(rules: KafkaHighlightRule[], fresh: KafkaMessage[]): void {
  rules
    .filter((rule) => rule.notify)
    .forEach((rule) => {
      const hits = fresh.filter((message) => matchingRules([rule], message).length > 0);
      hits.length > 0 && postKafkaMessage({ type: 'kafkaRuleHit', ruleName: rule.name, count: hits.length, sample: hits[0].value.slice(0, SAMPLE_LENGTH) });
    });
}

export function useRuleNotifications(messages: KafkaMessage[], rules: KafkaHighlightRule[]): void {
  const mountedAt = useRef(Date.now());
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const fresh = messages.filter((message) => !seen.current.has(message.id) && message.timestamp >= mountedAt.current);
    seen.current = new Set(messages.map((message) => message.id));
    fresh.length > 0 && notifyRuleHits(rules, fresh);
  }, [messages, rules]);
}
