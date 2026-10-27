import { FloppyDiskIcon, PlayIcon, StopIcon } from '@hugeicons/core-free-icons';
import { DEFAULT_BROKER, LOCAL_TEST_TOPICS } from '../../core/kafka/connection';
import { KafkaCollectionOption, KafkaProfileDraft, KafkaProfileView, KafkaStatus } from '../../shared/types';
import { Icon } from '../Icon';
import { ConfirmAction } from '../components/ConfirmAction';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { AuthFields, storedSecretsOf } from './AuthFields';
import { FormField } from './FormField';
import { ProtobufFields } from './ProtobufFields';
import { StartPositionFields } from './StartPositionFields';

const NO_COLLECTION = '__none__';
const STATUS_VARIANT = { disconnected: 'secondary', connecting: 'warning', connected: 'success', reconnecting: 'warning', error: 'destructive' } as const;

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
  const isConnected = status.state === 'connected' || status.state === 'connecting' || status.state === 'reconnecting';
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
      <StartPositionFields draft={draft} disabled={isConnected} onChange={patch} />
      <LabeledSwitch
        label="Read-only (never produce)"
        title="Disables Send, Resend and Replay for this connection"
        checked={draft.readOnly === true}
        onCheckedChange={(readOnly) => patch({ readOnly })}
      />
      <AuthFields
        draft={draft}
        storedSecrets={storedSecretsOf(profiles.find((profile) => profile.id === draft.id))}
        hasStoredPassword={hasStoredPassword}
        onChange={onChange}
      />
      <FormField label="Schema Registry URL (optional)">
        {(id) => <Input id={id} value={draft.schemaRegistryUrl ?? ''} placeholder="http://localhost:8081" onChange={(event) => patch({ schemaRegistryUrl: event.target.value })} />}
      </FormField>
      <FormField label="Schema Registry username">
        {(id) => <Input id={id} value={draft.schemaRegistryUsername ?? ''} onChange={(event) => patch({ schemaRegistryUsername: event.target.value })} />}
      </FormField>
      <FormField label="Schema Registry password">
        {(id) => <Input id={id} type="password" value={draft.schemaRegistryPassword ?? ''} onChange={(event) => patch({ schemaRegistryPassword: event.target.value })} />}
      </FormField>
      <ProtobufFields draft={draft} onChange={patch} />
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
            <Icon icon={StopIcon} /> {status.state === 'reconnecting' ? 'Stop reconnecting' : 'Disconnect'}
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
