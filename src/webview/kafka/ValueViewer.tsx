import { useEffect, useMemo, useState } from 'react';
import { formatMessageContent, parseJsonOrText } from '../../core/kafka/messageParsing';
import { TOMBSTONE_LABEL, isTombstone } from '../../core/kafka/tombstone';
import { VALUE_FORMAT_OPTIONS, isStructuredFormat, needsHostDecoding, renderValueAs } from '../../core/kafka/valueView';
import { KafkaMessageViewMode, KafkaValueFormat } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';
import { OptionSelect } from '../components/OptionSelect';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { postKafkaMessage } from '../vscodeApi';
import { HighlightedText } from './HighlightedText';
import { JsonTree } from './JsonTree';
import { useMessageDisplay } from './MessageDisplayContext';

const VIEW_MODES: Array<{ mode: KafkaMessageViewMode; label: string }> = [
  { mode: 'tree', label: 'Tree' },
  { mode: 'text', label: 'Text' },
  { mode: 'raw', label: 'Raw' },
];

function copyText(text: string): void {
  postKafkaMessage({ type: 'kafkaCopy', text });
}

export function ValueViewer({ message }: { message: KafkaMessage }) {
  return isTombstone(message) ? <TombstoneValue /> : <DecodedValueViewer message={message} />;
}

function TombstoneValue() {
  return (
    <section>
      <h4 className="kafka-section-title">Value</h4>
      <pre className="kafka-pre kafka-tombstone">{TOMBSTONE_LABEL}</pre>
    </section>
  );
}

function DecodedValueViewer({ message }: { message: KafkaMessage }) {
  const { viewMode, onViewModeChange, decodedValues, onDecode, highlightTerm } = useMessageDisplay();
  const [format, setFormat] = useState<KafkaValueFormat>('auto');
  const hostDecoded = needsHostDecoding(format, message) ? decodedValues[message.id] : undefined;
  const hostPending = needsHostDecoding(format, message) && !hostDecoded;
  const sourceText = hostDecoded?.text ?? renderValueAs(message, format);
  const structured = isStructuredFormat(format);
  const parsed = useMemo(() => (structured ? parseJsonOrText(sourceText) : sourceText), [structured, sourceText]);
  const decodeIssue = hostDecoded?.error ?? message.decodeError;

  useEffect(() => {
    needsHostDecoding(format, message) && onDecode(message, format);
  }, [format, message, onDecode]);

  return (
    <section>
      <div className="kafka-value-header">
        <h4 className="kafka-section-title">Value</h4>
        <OptionSelect value={format} options={VALUE_FORMAT_OPTIONS} onValueChange={setFormat} ariaLabel="Value as" className="kafka-value-format" />
        <div className="kafka-value-modes" role="group" aria-label="Value view mode">
          {VIEW_MODES.map(({ mode, label }) => (
            <Button key={mode} variant={viewMode === mode ? 'default' : 'secondary'} size="sm" aria-pressed={viewMode === mode} onClick={() => onViewModeChange(mode)}>
              {label}
            </Button>
          ))}
        </div>
        {message.valueFormat && <Badge variant="info">{message.schemaId === undefined ? message.valueFormat : `${message.valueFormat} #${message.schemaId}`}</Badge>}
      </div>
      {decodeIssue && <p className="kafka-error-box">{decodeIssue}</p>}
      {hostPending ? <p className="kafka-empty">Decoding…</p> : <ValueBody mode={viewMode} text={sourceText} parsed={parsed} term={highlightTerm} />}
    </section>
  );
}

interface BodyProps {
  mode: KafkaMessageViewMode;
  text: string;
  parsed: unknown;
  term: string;
}

function ValueBody({ mode, text, parsed, term }: BodyProps) {
  if (mode === 'tree' && typeof parsed === 'object' && parsed !== null) {
    return <JsonTree value={parsed} searchTerm={term} onCopy={copyText} />;
  }
  const shown = mode === 'raw' ? text : formatMessageContent(text);
  return <pre className="kafka-pre">{mode === 'raw' ? shown : <HighlightedText text={shown} />}</pre>;
}
