import { Delete02Icon, PauseIcon, PlayIcon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_FILTER } from '../../core/kafka/messageFilter';
import { groupByFlow, isLinkedFlow, uniqueTopics } from '../../core/kafka/flowGroups';
import { KafkaDecodedValue, KafkaUiState } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';
import { Icon } from '../Icon';
import { ConfirmAction } from '../components/ConfirmAction';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { postKafkaMessage } from '../vscodeApi';
import { EmptyState } from './EmptyState';
import { ExperienceHeader } from './ExperienceHeader';
import { FlowGroupList } from './FlowGroupList';
import { MessageDisplayContext } from './MessageDisplayContext';
import { MessageNavContext, useMessageNavState } from './MessageNav';
import { MessagesOptions, OptionsToggle, useOptionsOpen } from './MessagesOptions';
import { copyFlow, copyMessage, copyMessages, downloadFlow } from './flowActions';
import { ProduceActions, ProduceContext } from './ProduceActions';
import { useMessageExperience } from './useMessageExperience';
import { useMessageSelection } from './useMessageSelection';
import { useMessageShortcuts } from './useMessageShortcuts';

export const START_FROM_LAST_COUNT = 10;

interface Props {
  messages: KafkaMessage[];
  connected: boolean;
  onUseForSend: (message: KafkaMessage) => void;
  onResend: (message: KafkaMessage) => void;
  onStartFromLast?: () => void;
  active?: boolean;
  produce?: ProduceContext;
  ui?: KafkaUiState;
  decodedValues?: Record<string, KafkaDecodedValue>;
}

export function MessagesPanel({ messages, connected, onUseForSend, onResend, onStartFromLast, active = true, produce, ui, decodedValues }: Props) {
  const experience = useMessageExperience({ messages, hostUi: ui, decodedValues });
  const { topic, setTopic } = experience;
  const [frozen, setFrozen] = useState<KafkaMessage[] | null>(null);
  const [followNewest, setFollowNewest] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const selection = useMessageSelection();
  const root = useRef<HTMLDivElement>(null);
  const [optionsOpen, setOptionsOpen] = useOptionsOpen();

  const displayed = frozen ?? messages;
  const visible = useMemo(() => experience.apply(displayed), [displayed, experience.apply]);
  const groups = useMemo(() => groupByFlow(visible), [visible]);
  const topics = useMemo(() => uniqueTopics(displayed), [displayed]);
  const pendingCount = frozen ? messages.filter((message) => !frozen.some((known) => known.id === message.id)).length : 0;
  const linkedCount = groups.filter((group) => isLinkedFlow(group.flowId)).length;
  const selectedMessages = visible.filter((message) => selection.selectedIds.has(message.id));
  const orderedIds = useMemo(() => groups.flatMap((group) => group.messages.map((message) => message.id)), [groups]);
  const nav = useMessageNavState(orderedIds);

  useMessageShortcuts({
    active,
    onFocusFilter: () => root.current?.querySelector<HTMLInputElement>('input[aria-label="Search messages"]')?.focus(),
    onTogglePause: () => setFrozen(frozen ? null : messages),
    onMove: nav.move,
    onClose: nav.collapse,
  });

  useEffect(() => {
    followNewest && !frozen && scroller.current && (scroller.current.scrollTop = 0);
  }, [followNewest, frozen, messages]);

  const deleteMessages = (messageIds: string[]) => {
    postKafkaMessage({ type: 'kafkaDeleteMessages', messageIds });
    selection.toggle(messageIds, false);
    setFrozen((current) => current && current.filter((message) => !messageIds.includes(message.id)));
  };

  return (
    <MessageDisplayContext.Provider value={experience.display}>
    <MessageNavContext.Provider value={nav}>
    <div ref={root} className="kafka-messages">
      <ExperienceHeader experience={experience} />
      <div className="kafka-toolbar">
        <Button variant="secondary" size="sm" onClick={() => setFrozen(frozen ? null : messages)}>
          <Icon icon={frozen ? PlayIcon : PauseIcon} /> {frozen ? `Resume${pendingCount > 0 ? ` (${pendingCount} new)` : ''}` : 'Pause'}
        </Button>
        {produce && <ProduceActions context={produce} visible={visible} selected={selectedMessages} />}
        <ConfirmAction
          trigger={
            <Button variant="ghost" size="sm" disabled={messages.length === 0}>
              <Icon icon={Delete02Icon} /> Clear
            </Button>
          }
          title="Clear messages"
          description="Remove all received messages from this panel?"
          confirmLabel="Clear"
          onConfirm={() => postKafkaMessage({ type: 'kafkaClearMessages' })}
        />
        <OptionsToggle open={optionsOpen} onToggle={() => setOptionsOpen(!optionsOpen)} />
      </div>
      {optionsOpen && (
        <MessagesOptions
          followNewest={followNewest}
          onFollowNewestChange={setFollowNewest}
          viewMode={experience.display.viewMode}
          onViewModeChange={experience.display.onViewModeChange}
        />
      )}
      <div className="kafka-stats">
        <Badge variant="outline">{groups.length} flows</Badge>
        <Badge variant="outline">{visible.length} messages</Badge>
        <Badge variant="info">{linkedCount} linked</Badge>
        {topics.length > 1 && <TopicChips topics={topics} active={topic} onChange={setTopic} />}
        {selectedMessages.length > 0 && (
          <>
            <Button variant="secondary" size="sm" onClick={() => copyMessages(selectedMessages)}>
              Copy selected ({selectedMessages.length})
            </Button>
            {selectedMessages.length === 2 && (
              <Button variant="secondary" size="sm" onClick={() => experience.setCompared([selectedMessages[0], selectedMessages[1]])}>
                Compare selected
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => experience.display.onSaveAsRequest(selectedMessages)}>
              Save as requests ({selectedMessages.length})
            </Button>
            <ConfirmAction
              trigger={
                <Button variant="destructive" size="sm">
                  Delete selected
                </Button>
              }
              title="Delete selected messages"
              description={`Delete ${selectedMessages.length} selected message(s)?`}
              confirmLabel="Delete"
              onConfirm={() => deleteMessages(selectedMessages.map((message) => message.id))}
            />
          </>
        )}
      </div>
      <div ref={scroller} className="kafka-scroll">
        {groups.length === 0 ? (
          <MessagesEmptyState
            connected={connected}
            hasMessages={messages.length > 0}
            onResetFilter={() => experience.setFilter(EMPTY_FILTER)}
            onStartFromLast={onStartFromLast}
          />
        ) : (
          <FlowGroupList
            groups={groups}
            selectedIds={selection.selectedIds}
            onToggleSelected={selection.toggle}
            onCopy={copyMessage}
            onCopyFlow={copyFlow}
            onDownloadFlow={downloadFlow}
            onDelete={(message) => deleteMessages([message.id])}
            onDeleteFlow={(group) => deleteMessages(group.messages.map((message) => message.id))}
            onUseForSend={onUseForSend}
            onResend={onResend}
          />
        )}
      </div>
    </div>
    </MessageNavContext.Provider>
    </MessageDisplayContext.Provider>
  );
}

interface EmptyProps {
  connected: boolean;
  hasMessages: boolean;
  onResetFilter: () => void;
  onStartFromLast?: () => void;
}

function MessagesEmptyState({ connected, hasMessages, onResetFilter, onStartFromLast }: EmptyProps) {
  if (hasMessages) {
    return <EmptyState title="No messages match the current search" hint="Adjust the search or filters to see more." actionLabel="Reset filter" onAction={onResetFilter} />;
  }
  if (connected) {
    return <EmptyState title="Waiting for messages…" hint="Messages appear here as they arrive on the subscribed topics." />;
  }
  return (
    <EmptyState
      title="Not listening yet"
      hint="Connect to a broker to start listening, or replay recent history to see messages right away."
      actionLabel={`Start from last ${START_FROM_LAST_COUNT} messages`}
      onAction={onStartFromLast}
    />
  );
}

interface TopicChipsProps {
  topics: string[];
  active: string | null;
  onChange: (topic: string | null) => void;
}

function TopicChips({ topics, active, onChange }: TopicChipsProps) {
  return (
    <div className="kafka-topic-chips">
      <Button variant={active === null ? 'default' : 'secondary'} size="sm" onClick={() => onChange(null)}>
        All topics
      </Button>
      {topics.map((name) => (
        <Button key={name} variant={active === name ? 'default' : 'secondary'} size="sm" onClick={() => onChange(active === name ? null : name)}>
          {name}
        </Button>
      ))}
    </div>
  );
}
