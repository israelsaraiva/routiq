import { Cancel01Icon, Copy01Icon, Delete02Icon, FloppyDiskIcon, RefreshIcon, SentIcon } from '@hugeicons/core-free-icons';
import { parseMessage, serializeHeaders } from '../../core/kafka/messageParsing';
import { KafkaMessage } from '../../shared/types';
import { IconButton } from '../components/IconButton';
import { HighlightedText } from './HighlightedText';
import { useMessageDisplay } from './MessageDisplayContext';
import { MessageActions } from './MessageCard';
import { TruncationNotice } from './TruncationNotice';
import { ValueViewer } from './ValueViewer';

interface Props extends MessageActions {
  message: KafkaMessage;
  onClose: () => void;
}

export function MessageDetailPanel({ message, onClose, onCopy, onDelete, onUseForSend, onResend }: Props) {
  const { onSaveAsRequest } = useMessageDisplay();
  const parsed = parseMessage(message.value);
  const headersText = serializeHeaders(message.headers);
  const summary = message.structuredMessage ?? message.rawMessage;
  const location = message.topic ? `${message.topic} · ${message.partition}:${message.offset}` : new Date(message.timestamp).toLocaleString();

  return (
    <aside className="kafka-detail" aria-label="Message detail" data-testid="kafka-message-detail">
      <header className="kafka-detail-header">
        <span className="kafka-detail-title" title={location}>{location}</span>
        <div className="kafka-detail-actions">
          <IconButton icon={Copy01Icon} label="Copy message" compact onClick={() => onCopy(message)} />
          <IconButton icon={FloppyDiskIcon} label="Save detail as Routiq request" compact onClick={() => onSaveAsRequest([message])} />
          {onUseForSend && <IconButton icon={SentIcon} label="Use detail for Send" compact onClick={() => onUseForSend(message)} />}
          {onResend && <IconButton icon={RefreshIcon} label="Resend detail message" compact onClick={() => onResend(message)} />}
          {onDelete && <IconButton icon={Delete02Icon} label="Delete detail message" compact onClick={() => onDelete(message)} />}
          <IconButton icon={Cancel01Icon} label="Close detail" compact onClick={onClose} />
        </div>
      </header>
      <div className="kafka-detail-body">
        {parsed.errorMessage && <p className="kafka-error-box">{parsed.errorMessage}</p>}
        {summary && (
          <pre className="kafka-pre">
            <HighlightedText text={summary} />
          </pre>
        )}
        {message.key && <DetailSection title="Key" text={message.key} />}
        {headersText && <DetailSection title="Headers" text={headersText} />}
        <TruncationNotice message={message} />
        <ValueViewer message={message} />
      </div>
    </aside>
  );
}

function DetailSection({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h4 className="kafka-section-title">{title}</h4>
      <pre className="kafka-pre">{text}</pre>
    </section>
  );
}
