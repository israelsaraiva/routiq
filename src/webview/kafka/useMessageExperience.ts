import { useCallback, useMemo, useState } from 'react';
import { generateId } from '../../core/ids';
import { countRuleHits } from '../../core/kafka/highlightRules';
import { EMPTY_FILTER, filterByStructuredFilter, isFilterActive } from '../../core/kafka/messageFilter';
import { buildSaveItems } from '../../core/kafka/messageToRequest';
import { KafkaDecodedValue, KafkaFilterView, KafkaMessageFilter, KafkaUiState } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';
import { postKafkaMessage } from '../vscodeApi';
import { MessageDisplay } from './MessageDisplayContext';
import { useMessageUi, useRuleNotifications } from './useMessageUi';

export interface MessageExperience {
  ui: KafkaUiState;
  update: (patch: Partial<KafkaUiState>) => void;
  filter: KafkaMessageFilter;
  setFilter: (filter: KafkaMessageFilter) => void;
  topic: string | null;
  setTopic: (topic: string | null) => void;
  activeViewId: string | null;
  selectView: (viewId: string | null) => void;
  addView: () => void;
  closeView: (viewId: string) => void;
  canAddView: boolean;
  apply: (messages: KafkaMessage[]) => KafkaMessage[];
  display: MessageDisplay;
  ruleHits: Record<string, number>;
  compared: [KafkaMessage, KafkaMessage] | null;
  setCompared: (pair: [KafkaMessage, KafkaMessage] | null) => void;
}

interface Inputs {
  messages: KafkaMessage[];
  hostUi?: KafkaUiState;
  decodedValues?: Record<string, KafkaDecodedValue>;
}

export function useMessageExperience({ messages, hostUi, decodedValues }: Inputs): MessageExperience {
  const { ui, update } = useMessageUi(hostUi);
  const [allFilter, setAllFilter] = useState<KafkaMessageFilter>(EMPTY_FILTER);
  const [allTopic, setAllTopic] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [compared, setCompared] = useState<[KafkaMessage, KafkaMessage] | null>(null);
  const activeView = ui.views.find((view) => view.id === activeViewId);
  const filter = activeView?.filter ?? allFilter;
  const topic = activeView ? activeView.topic : allTopic;

  useRuleNotifications(messages, ui.rules);

  const patchActiveView = (changes: Partial<KafkaFilterView>) => update({ views: ui.views.map((view) => (view.id === activeViewId ? { ...view, ...changes } : view)) });
  const setFilter = (next: KafkaMessageFilter) => (activeView ? patchActiveView({ filter: next }) : setAllFilter(next));
  const setTopic = (next: string | null) => (activeView ? patchActiveView({ topic: next }) : setAllTopic(next));

  const addView = () => {
    const view: KafkaFilterView = { id: generateId(), name: filter.text.trim() || topic || `View ${ui.views.length + 1}`, topic, filter };
    update({ views: [...ui.views, view] });
    setActiveViewId(view.id);
  };

  const closeView = (viewId: string) => {
    update({ views: ui.views.filter((view) => view.id !== viewId) });
    viewId === activeViewId && setActiveViewId(null);
  };

  const apply = useCallback(
    (candidates: KafkaMessage[]) => filterByStructuredFilter(topic ? candidates.filter((message) => message.topic === topic) : candidates, filter),
    [filter, topic],
  );

  const onDecode = useCallback<MessageDisplay['onDecode']>((message, format) => {
    message.valueBase64 && postKafkaMessage({ type: 'kafkaDecode', messageId: message.id, base64: message.valueBase64, format });
  }, []);

  const display = useMemo<MessageDisplay>(
    () => ({
      viewMode: ui.viewMode,
      onViewModeChange: (viewMode) => update({ viewMode }),
      highlightTerm: filter.regex ? '' : filter.text,
      rules: ui.rules,
      decodedValues: decodedValues ?? {},
      onDecode,
      onSaveAsRequest: (selected) => postKafkaMessage({ type: 'kafkaSaveAsRequest', items: buildSaveItems(selected) }),
    }),
    [ui.viewMode, ui.rules, filter.regex, filter.text, decodedValues, onDecode, update],
  );

  const ruleHits = useMemo(() => countRuleHits(ui.rules, messages), [ui.rules, messages]);

  return {
    ui,
    update,
    filter,
    setFilter,
    topic,
    setTopic,
    activeViewId,
    selectView: setActiveViewId,
    addView,
    closeView,
    canAddView: isFilterActive(filter) || topic !== null,
    apply,
    display,
    ruleHits,
    compared,
    setCompared,
  };
}
