import { useState } from 'react';
import { validatePartitionIncrease } from '../../../core/kafka/topicConfigEdit';
import { ConfirmAction } from '../../components/ConfirmAction';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

interface Props {
  topic: string;
  currentPartitions: number;
  onIncrease: (totalPartitions: number) => void;
}

export function IncreasePartitions({ topic, currentPartitions, onIncrease }: Props) {
  const [text, setText] = useState('');
  const requested = Number(text);
  const invalid = text.trim() === '' ? 'Enter the new total number of partitions' : validatePartitionIncrease(currentPartitions, requested);

  return (
    <div className="kafka-actions">
      <Input aria-label="New partition count" type="number" min={currentPartitions + 1} value={text} placeholder={`> ${currentPartitions}`} onChange={(event) => setText(event.target.value)} />
      <ConfirmAction
        trigger={
          <Button variant="secondary" size="sm" disabled={invalid !== undefined}>
            Increase partitions
          </Button>
        }
        title={`Increase partitions of ${topic}?`}
        description={`Partitions go from ${currentPartitions} to ${requested}. This cannot be undone and changes the key-to-partition mapping for new messages.`}
        confirmLabel="Increase"
        onConfirm={() => onIncrease(requested)}
      />
      {invalid && text.trim() !== '' && <span className="kafka-error">{invalid}</span>}
    </div>
  );
}
