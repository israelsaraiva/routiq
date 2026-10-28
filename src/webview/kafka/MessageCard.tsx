import { Copy01Icon, Delete02Icon, FloppyDiskIcon, RefreshIcon, SentIcon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useRef } from 'react';
import { matchingRules } from '../../core/kafka/highlightRules';
import { parseMessage } from '../../core/kafka/messageParsing';
import { TOMBSTONE_LABEL, isTombstone } from '../../core/kafka/tombstone';
import { KafkaMessage } from '../../shared/types';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { IconButton } from '../components/IconButton';
import { useMessageDisplay } from './MessageDisplayContext';
import { useMessageNav } from './MessageNav';

const LEVEL_VARIANT: Record<string, 'destructive' | 'warning' | 'info' | 'secondary'> = { error: 'destructive', warn: 'warning', warning: 'warning', info: 'info' };

export interface MessageActions {
  onCopy: (message: KafkaMessage) => void;
  onDelete?: (message: KafkaMessage) => void;
  onUseForSend?: (message: KafkaMessage) => void;
  onResend?: (message: KafkaMessage) => void;
}

interface Props extends MessageActions {
  message: KafkaMessage;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}

const PREVIEW_LENGTH = 200;

function previewOf(message: KafkaMessage, tombstone: boolean): string {
  const text = tombstone ? TOMBSTONE_LABEL : (message.structuredMessage ?? message.rawMessage ?? message.value);
  return text.replace(/\s+/g, ' ').slice(0, PREVIEW_LENGTH);
}

export function MessageCard({ message, selected, onSelectedChange, onCopy, onDelete, onUseForSend, onResend }: Props) {
  const { rules, onSaveAsRequest } = useMessageDisplay();
  const { activeId, openId, open } = useMessageNav();
  const rowRef = useRef<HTMLElement>(null);
  const opened = openId === message.id;
  const active = activeId === message.id;
  const tombstone = isTombstone(message);
  const hits = useMemo(() => matchingRules(rules, message), [rules, message]);
  const parsed = parseMessage(message.value);

  useEffect(() => {
    active && rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  return (
    <article
      ref={rowRef}
      className="kafka-message"
      data-testid="kafka-message"
      data-active={active}
      data-open={opened}
      data-tombstone={tombstone}
      style={hits[0] ? { borderLeftColor: hits[0].color } : undefined}
    >
      <header className="kafka-message-header">
        <span className="kafka-flow-marker" aria-hidden="true" />
        <Checkbox checked={selected} onCheckedChange={(checked) => onSelectedChange(checked === true)} aria-label="Select message" />
        <div
          className="kafka-row-main"
          tabIndex={0}
          aria-label="Show message details"
          aria-current={opened}
          onClick={() => open(message.id)}
          onKeyDown={(event) => event.key === 'Enter' && open(message.id)}
        >
          <time className="kafka-time" title={receivedAtTitle(message)}>{new Date(message.timestamp).toLocaleTimeString()}</time>
          {message.topic && <span className="kafka-chip kafka-chip-topic" title={message.topic}>{message.topic}</span>}
          {message.topic && <span className="kafka-chip kafka-chip-offset" title={`partition ${message.partition}, offset ${message.offset}`}>{`${message.partition}:${message.offset}`}</span>}
          {tombstone && <span className="kafka-chip kafka-chip-tombstone">tombstone</span>}
          {message.key && <span className="kafka-key" title={message.key}>{message.key}</span>}
          <span className="kafka-preview" data-tombstone={tombstone}>{previewOf(message, tombstone)}</span>
          <span className="kafka-row-tags">
            {message.level && <Badge variant={LEVEL_VARIANT[message.level.toLowerCase()] ?? 'secondary'}>{message.level}</Badge>}
            {message.containerName && <Badge variant="outline">{message.containerName}</Badge>}
            {message.eventType && <Badge variant="info">{message.eventType}</Badge>}
            {message.flowName && <Badge variant="info">{message.flowName}</Badge>}
            {parsed.commandName && <Badge variant="default">{parsed.commandName}</Badge>}
            {parsed.success === true && <Badge variant="success">success</Badge>}
            {parsed.success === false && <Badge variant="destructive">fail</Badge>}
            {hits.filter((rule) => rule.badge).map((rule) => (
              <Badge key={rule.id} variant="outline" className="kafka-rule-badge" style={{ borderColor: rule.color, color: rule.color }}>
                {rule.name}
              </Badge>
            ))}
          </span>
        </div>
        <div className="kafka-message-actions">
          <IconButton icon={Copy01Icon} label="Copy message" compact onClick={() => onCopy(message)} />
          <IconButton icon={FloppyDiskIcon} label="Save as Routiq request" compact onClick={() => onSaveAsRequest([message])} />
          {onUseForSend && <IconButton icon={SentIcon} label="Use for Send" compact onClick={() => onUseForSend(message)} />}
          {onResend && <IconButton icon={RefreshIcon} label="Resend message" compact onClick={() => onResend(message)} />}
          {onDelete && <IconButton icon={Delete02Icon} label="Delete message" compact onClick={() => onDelete(message)} />}
        </div>
      </header>
    </article>
  );
}

function receivedAtTitle(message: KafkaMessage): string | undefined {
  return message.receivedAt ? `Record time ${new Date(message.timestamp).toLocaleString()} · received ${new Date(message.receivedAt).toLocaleString()}` : undefined;
}
