import { ArrowDown01Icon, ArrowRight01Icon, Copy01Icon, Delete02Icon, FloppyDiskIcon, RefreshIcon, SentIcon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { matchingRules } from '../../core/kafka/highlightRules';
import { parseMessage, serializeHeaders } from '../../core/kafka/messageParsing';
import { KafkaMessage } from '../../shared/types';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { IconButton } from '../components/IconButton';
import { HighlightedText } from './HighlightedText';
import { useMessageDisplay } from './MessageDisplayContext';
import { TruncationNotice } from './TruncationNotice';
import { ValueViewer } from './ValueViewer';

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

export function MessageCard({ message, selected, onSelectedChange, onCopy, onDelete, onUseForSend, onResend }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { rules, onSaveAsRequest } = useMessageDisplay();
  const hits = useMemo(() => matchingRules(rules, message), [rules, message]);
  const parsed = parseMessage(message.value);
  const headersText = serializeHeaders(message.headers);
  const summary = message.structuredMessage ?? message.rawMessage;

  return (
    <article className="kafka-message" data-testid="kafka-message" style={hits[0] ? { borderLeftColor: hits[0].color } : undefined}>
      <header className="kafka-message-header">
        <Checkbox checked={selected} onCheckedChange={(checked) => onSelectedChange(checked === true)} aria-label="Select message" />
        <IconButton
          icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
          label={expanded ? 'Hide details' : 'Show details'}
          compact
          onClick={() => setExpanded(!expanded)}
        />
        <div className="kafka-badges">
          <Badge variant="outline">{message.topic}</Badge>
          {message.topic && <Badge variant="secondary">{`p${message.partition} · #${message.offset}`}</Badge>}
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
        </div>
        <time className="kafka-time" title={receivedAtTitle(message)}>{new Date(message.timestamp).toLocaleTimeString()}</time>
        <div className="kafka-message-actions">
          <IconButton icon={Copy01Icon} label="Copy message" compact onClick={() => onCopy(message)} />
          <IconButton icon={FloppyDiskIcon} label="Save as Routiq request" compact onClick={() => onSaveAsRequest([message])} />
          {onUseForSend && <IconButton icon={SentIcon} label="Use for Send" compact onClick={() => onUseForSend(message)} />}
          {onResend && <IconButton icon={RefreshIcon} label="Resend message" compact onClick={() => onResend(message)} />}
          {onDelete && <IconButton icon={Delete02Icon} label="Delete message" compact onClick={() => onDelete(message)} />}
        </div>
      </header>
      {parsed.errorMessage && <p className="kafka-error-box">{parsed.errorMessage}</p>}
      {summary && (
        <pre className="kafka-pre">
          <HighlightedText text={summary} />
        </pre>
      )}
      {expanded && (
        <div className="kafka-message-details">
          {message.key && <MessageSection title="Key" text={message.key} />}
          {headersText && <MessageSection title="Headers" text={headersText} />}
          <TruncationNotice message={message} />
          <ValueViewer message={message} />
        </div>
      )}
    </article>
  );
}

function receivedAtTitle(message: KafkaMessage): string | undefined {
  return message.receivedAt ? `Record time ${new Date(message.timestamp).toLocaleString()} · received ${new Date(message.receivedAt).toLocaleString()}` : undefined;
}

function MessageSection({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h4 className="kafka-section-title">{title}</h4>
      <pre className="kafka-pre">{text}</pre>
    </section>
  );
}
