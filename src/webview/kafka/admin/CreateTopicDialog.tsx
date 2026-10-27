import { useState } from 'react';
import { TopicCreationInput, buildTopicCreation, validateTopicCreation } from '../../../core/kafka/admin';
import { KafkaTopicCreation } from '../../../shared/kafkaAdminTypes';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { FormField } from '../FormField';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (topic: KafkaTopicCreation) => void;
}

const EMPTY_INPUT: TopicCreationInput = { name: '', partitions: '1', replicationFactor: '1', configText: '' };
const CONFIG_PLACEHOLDER = 'retention.ms=604800000\ncleanup.policy=delete';

function describeCreation({ name, partitions, replicationFactor, configs }: KafkaTopicCreation): string {
  const configCount = Object.keys(configs).length;
  const configSuffix = configCount > 0 ? ` and ${configCount} config override(s)` : '';
  return `Create topic "${name}" with ${partitions} partition(s), replication factor ${replicationFactor}${configSuffix}?`;
}

export function CreateTopicDialog({ open, onOpenChange, onCreate }: Props) {
  const [input, setInput] = useState(EMPTY_INPUT);
  const [confirming, setConfirming] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const error = validateTopicCreation(input);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setInput(EMPTY_INPUT);
      setConfirming(false);
      setShowErrors(false);
    }
  };

  const review = () => {
    setShowErrors(true);
    !error && setConfirming(true);
  };

  const confirm = () => {
    onCreate(buildTopicCreation(input));
    close(false);
  };

  const edit = (changes: Partial<TopicCreationInput>) => setInput({ ...input, ...changes });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create topic</DialogTitle>
          <DialogDescription>{confirming ? describeCreation(buildTopicCreation(input)) : 'Define the new topic on the connected cluster.'}</DialogDescription>
        </DialogHeader>
        {!confirming && (
          <div className="kafka-connection">
            <FormField label="Topic name">{(id) => <Input id={id} value={input.name} onChange={(event) => edit({ name: event.target.value })} />}</FormField>
            <FormField label="Partitions">
              {(id) => <Input id={id} inputMode="numeric" value={input.partitions} onChange={(event) => edit({ partitions: event.target.value })} />}
            </FormField>
            <FormField label="Replication factor">
              {(id) => <Input id={id} inputMode="numeric" value={input.replicationFactor} onChange={(event) => edit({ replicationFactor: event.target.value })} />}
            </FormField>
            <FormField label="Configs (one name=value per line, optional)">
              {(id) => <Textarea id={id} rows={3} placeholder={CONFIG_PLACEHOLDER} value={input.configText} onChange={(event) => edit({ configText: event.target.value })} />}
            </FormField>
            {showErrors && error && <p className="kafka-error">{error}</p>}
          </div>
        )}
        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Back
              </Button>
              <Button onClick={confirm}>Confirm create</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button onClick={review}>Create…</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
