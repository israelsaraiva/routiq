import { diffJsonSideBySide, DiffLine } from '../../core/kafka/jsonDiff';
import { parseJsonOrText } from '../../core/kafka/messageParsing';
import { KafkaMessage } from '../../shared/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';

interface Props {
  messages: [KafkaMessage, KafkaMessage] | null;
  onClose: () => void;
}

function describeMessage(message: KafkaMessage): string {
  return `${message.topic} p${message.partition} #${message.offset}`;
}

export function CompareDialog({ messages, onClose }: Props) {
  const diff = messages ? diffJsonSideBySide(parseJsonOrText(messages[0].value), parseJsonOrText(messages[1].value)) : null;
  const changedLines = diff ? diff.left.filter((line) => line.kind !== 'same').length + diff.right.filter((line) => line.kind !== 'same').length : 0;

  return (
    <Dialog open={messages !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="kafka-compare-dialog">
        <DialogHeader>
          <DialogTitle>Compare messages</DialogTitle>
          <DialogDescription>{changedLines === 0 ? 'The two values are identical.' : `${changedLines} differing line(s); keys are sorted for comparison.`}</DialogDescription>
        </DialogHeader>
        {messages && diff && (
          <div className="kafka-compare" data-testid="kafka-compare">
            <ComparePane title={describeMessage(messages[0])} lines={diff.left} />
            <ComparePane title={describeMessage(messages[1])} lines={diff.right} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ComparePane({ title, lines }: { title: string; lines: DiffLine[] }) {
  return (
    <section className="kafka-compare-pane">
      <h4 className="kafka-section-title">{title}</h4>
      <pre className="kafka-pre">
        {lines.map((line, index) => (
          <div key={index} className={`kafka-diff-line kafka-diff-${line.kind}`} data-diff={line.kind}>
            {line.text || ' '}
          </div>
        ))}
      </pre>
    </section>
  );
}
