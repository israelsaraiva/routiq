import { Delete02Icon, Download01Icon, PauseIcon, PlayIcon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { filterMessages, groupByFlow, isLinkedFlow, messagesExportFileName, uniqueTopics } from '../../core/kafka/flowGroups';
import { buildMessagesExport } from '../../core/kafka/messageParsing';
import { KafkaMessage } from '../../shared/types';
import { Icon } from '../Icon';
import { ConfirmAction } from '../components/ConfirmAction';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { postKafkaMessage } from '../vscodeApi';
import { FlowGroupList } from './FlowGroupList';
import { copyFlow, copyMessage, copyMessages, downloadFlow } from './flowActions';
import { useMessageSelection } from './useMessageSelection';

interface Props {
  messages: KafkaMessage[];
  connected: boolean;
  onUseForSend: (message: KafkaMessage) => void;
  onResend: (message: KafkaMessage) => void;
}

export function MessagesPanel({ messages, connected, onUseForSend, onResend }: Props) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<KafkaMessage[] | null>(null);
  const [followNewest, setFollowNewest] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const selection = useMessageSelection();

  const displayed = frozen ?? messages;
  const visible = useMemo(() => filterMessages(displayed, query, topic), [displayed, query, topic]);
  const groups = useMemo(() => groupByFlow(visible), [visible]);
  const topics = useMemo(() => uniqueTopics(displayed), [displayed]);
  const pendingCount = frozen ? messages.filter((message) => !frozen.some((known) => known.id === message.id)).length : 0;
  const linkedCount = groups.filter((group) => isLinkedFlow(group.flowId)).length;
  const selectedMessages = visible.filter((message) => selection.selectedIds.has(message.id));

  useEffect(() => {
    followNewest && !frozen && scroller.current && (scroller.current.scrollTop = 0);
  }, [followNewest, frozen, messages]);

  const deleteMessages = (messageIds: string[]) => {
    postKafkaMessage({ type: 'kafkaDeleteMessages', messageIds });
    selection.toggle(messageIds, false);
    setFrozen((current) => current && current.filter((message) => !messageIds.includes(message.id)));
  };

  const exportAll = () =>
    postKafkaMessage({ type: 'kafkaSaveFile', suggestedName: messagesExportFileName(new Date()), content: buildMessagesExport(visible) });

  return (
    <div className="kafka-messages">
      <div className="kafka-toolbar">
        <Input aria-label="Search messages" placeholder="Search value, topic, flowId, key, headers…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button variant="secondary" size="sm" onClick={() => setFrozen(frozen ? null : messages)}>
          <Icon icon={frozen ? PlayIcon : PauseIcon} /> {frozen ? `Resume${pendingCount > 0 ? ` (${pendingCount} new)` : ''}` : 'Pause'}
        </Button>
        <LabeledSwitch label="Follow newest" checked={followNewest} onCheckedChange={setFollowNewest} />
        <Button variant="secondary" size="sm" disabled={visible.length === 0} onClick={exportAll}>
          <Icon icon={Download01Icon} /> Export all
        </Button>
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
      </div>
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
          <p className="kafka-empty">{emptyText(connected, messages.length > 0)}</p>
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
  );
}

function emptyText(connected: boolean, hasMessages: boolean): string {
  if (hasMessages) {
    return 'No messages match the current search.';
  }
  return connected ? 'Waiting for messages…' : 'Connect to a broker to start listening.';
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
