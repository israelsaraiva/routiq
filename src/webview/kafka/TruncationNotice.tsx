import { formatByteSize } from '../../core/kafka/truncation';
import { KafkaMessage } from '../../shared/types';
import { Button } from '../components/ui/button';
import { postKafkaMessage } from '../vscodeApi';

export function TruncationNotice({ message }: { message: KafkaMessage }) {
  if (!message.valueTruncated) {
    return null;
  }
  return (
    <p className="kafka-truncation">
      Value truncated ({message.valueSize === undefined ? 'large' : formatByteSize(message.valueSize)} total).{' '}
      <Button variant="secondary" size="sm" onClick={() => postKafkaMessage({ type: 'kafkaRequestFullMessage', messageId: message.id })}>
        Show full
      </Button>
    </p>
  );
}
