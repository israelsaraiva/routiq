import { useState } from 'react';
import { KafkaOffsetResetTarget } from '../../../shared/kafkaAdminTypes';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { FormField } from '../FormField';

interface Props {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReset: (target: KafkaOffsetResetTarget) => void;
}

type TargetKind = KafkaOffsetResetTarget['kind'];

const TARGET_OPTIONS: Array<{ kind: TargetKind; label: string }> = [
  { kind: 'earliest', label: 'Earliest' },
  { kind: 'latest', label: 'Latest' },
  { kind: 'timestamp', label: 'Timestamp' },
];

export function toResetTarget(kind: TargetKind, timestampText: string): KafkaOffsetResetTarget | undefined {
  if (kind !== 'timestamp') {
    return { kind };
  }
  const timestamp = Date.parse(timestampText);
  return Number.isNaN(timestamp) ? undefined : { kind, timestamp };
}

export function ResetOffsetsDialog({ groupId, open, onOpenChange, onReset }: Props) {
  const [kind, setKind] = useState<TargetKind>('earliest');
  const [timestampText, setTimestampText] = useState('');
  const target = toResetTarget(kind, timestampText);

  const confirm = () => {
    target && onReset(target);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset offsets of {groupId}</DialogTitle>
          <DialogDescription>Committed offsets of every topic of this empty group are moved. Consumers will re-read or skip messages accordingly.</DialogDescription>
        </DialogHeader>
        <div className="kafka-connection" role="radiogroup" aria-label="Reset target">
          {TARGET_OPTIONS.map((option) => (
            <label key={option.kind} className="inline-check">
              <input type="radio" name="reset-target" checked={kind === option.kind} onChange={() => setKind(option.kind)} /> {option.label}
            </label>
          ))}
          {kind === 'timestamp' && (
            <FormField label="Reset to first message at or after">
              {(id) => <Input id={id} type="datetime-local" value={timestampText} onChange={(event) => setTimestampText(event.target.value)} />}
            </FormField>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!target} onClick={confirm}>
            Reset offsets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
