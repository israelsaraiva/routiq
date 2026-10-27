import { FloppyDiskIcon, PlayIcon, StopIcon } from '@hugeicons/core-free-icons';
import { DEFAULT_BROKER, LOCAL_TEST_TOPICS, SASL_MECHANISM_OPTIONS } from '../../core/kafka/connection';
import { KafkaCollectionOption, KafkaProfileDraft, KafkaProfileView, KafkaStatus } from '../../shared/types';
import { Icon } from '../Icon';
import { ConfirmAction } from '../components/ConfirmAction';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { FormField } from './FormField';

const NO_COLLECTION = '__none__';
const STATUS_VARIANT = { disconnected: 'secondary', connecting: 'warning', connected: 'success', error: 'destructive' } as const;

interface Props {
  draft: KafkaProfileDraft;
  profiles: KafkaProfileView[];
  collections: KafkaCollectionOption[];
  status: KafkaStatus;
  hasStoredPassword: boolean;
  onChange: (draft: KafkaProfileDraft) => void;
  onSelectProfile: (profileId: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectionForm({ draft, profiles, collections, status, hasStoredPassword, onChange, onSelectProfile, onSave, onDelete, onConnect, onDisconnect }: Props) {
  const patch = (changes: Partial<KafkaProfileDraft>) => onChange({ ...draft, ...changes });
  const isConnected = status.state === 'connected' || status.state === 'connecting';
  const usesSasl = draft.saslMechanism !== 'none';
  const profileOptions = profiles.map((profile) => ({ value: profile.id, label: profile.name }));
  const collectionOptions = [{ value: NO_COLLECTION, label: 'None' }, ...collections.map((collection) => ({ value: collection.id, label: collection.name }))];

  return (
    <form className="kafka-connection" onSubmit={(event) => event.preventDefault()}>
      <div className="kafka-status-row">
        <Badge variant={STATUS_VARIANT[status.state]}>{status.state}</Badge>
        {status.detail && <span className="kafka-status-detail">{status.detail}</span>}
      </div>
      {profiles.length > 0 && (
        <FormField label="Saved connection">
          {() => <OptionSelect value={draft.id} options={profileOptions} onValueChange={onSelectProfile} ariaLabel="Saved connection" />}
        </FormField>
      )}
      <FormField label="Name">{(id) => <Input id={id} value={draft.name} onChange={(event) => patch({ name: event.target.value })} />}</FormField>
      <FormField label="Broker(s)">
        {(id) => <Input id={id} value={draft.brokers} placeholder={DEFAULT_BROKER} disabled={isConnected} onChange={(event) => patch({ brokers: event.target.value })} />}
      </FormField>
      <FormField label="Topics (comma separated)">
        {(id) => <Input id={id} value={draft.topics} placeholder="topic-a, topic-b" disabled={isConnected} onChange={(event) => patch({ topics: event.target.value })} />}
      </FormField>
      <Button variant="secondary" size="sm" disabled={isConnected} onClick={() => patch({ brokers: DEFAULT_BROKER, topics: LOCAL_TEST_TOPICS })}>
        Use Test Kafka
      </Button>
      <FormField label="Consumer group (optional)">
        {(id) => <Input id={id} value={draft.groupId} placeholder="auto-generated" disabled={isConnected} onChange={(event) => patch({ groupId: event.target.value })} />}
      </FormField>
      <LabeledSwitch label="Consume from beginning" checked={draft.fromBeginning} onCheckedChange={(fromBeginning) => patch({ fromBeginning })} />
      <LabeledSwitch label="SSL / TLS" checked={draft.ssl} onCheckedChange={(ssl) => patch({ ssl })} />
      <FormField label="SASL">
        {() => <OptionSelect value={draft.saslMechanism} options={SASL_MECHANISM_OPTIONS} onValueChange={(saslMechanism) => patch({ saslMechanism })} ariaLabel="SASL mechanism" />}
      </FormField>
      {usesSasl && (
        <>
          <FormField label="SASL username">{(id) => <Input id={id} value={draft.saslUsername} onChange={(event) => patch({ saslUsername: event.target.value })} />}</FormField>
          <FormField label="SASL password">
            {(id) => (
              <Input
                id={id}
                type="password"
                value={draft.saslPassword ?? ''}
                placeholder={hasStoredPassword ? 'Stored in Secret Storage' : ''}
                onChange={(event) => patch({ saslPassword: event.target.value })}
              />
            )}
          </FormField>
        </>
      )}
      <FormField label="Variables from collection">
        {() => (
          <OptionSelect
            value={draft.variablesCollectionId ?? NO_COLLECTION}
            options={collectionOptions}
            onValueChange={(value) => patch({ variablesCollectionId: value === NO_COLLECTION ? undefined : value })}
            ariaLabel="Variables collection"
          />
        )}
      </FormField>
      <div className="kafka-actions">
        {isConnected ? (
          <Button variant="destructive" onClick={onDisconnect}>
            <Icon icon={StopIcon} /> Disconnect
          </Button>
        ) : (
          <Button onClick={onConnect}>
            <Icon icon={PlayIcon} /> Connect
          </Button>
        )}
        <Button variant="secondary" onClick={onSave}>
          <Icon icon={FloppyDiskIcon} /> Save
        </Button>
        <ConfirmAction
          trigger={<Button variant="ghost">Delete</Button>}
          title="Delete connection"
          description={`Delete "${draft.name}" and its stored password and messages?`}
          confirmLabel="Delete"
          onConfirm={onDelete}
        />
      </div>
    </form>
  );
}
