import { START_MODE_OPTIONS } from '../../core/kafka/startPosition';
import { KafkaStartMode } from '../../shared/kafkaEngineTypes';
import { KafkaProfileDraft } from '../../shared/types';
import { OptionSelect } from '../components/OptionSelect';
import { Input } from '../components/ui/input';
import { FormField } from './FormField';

const DEFAULT_LAST_N = 10;

interface Props {
  draft: KafkaProfileDraft;
  disabled: boolean;
  onChange: (changes: Partial<KafkaProfileDraft>) => void;
}

export function resolveDraftStartMode(draft: KafkaProfileDraft): KafkaStartMode {
  return draft.startMode ?? (draft.fromBeginning ? 'beginning' : 'latest');
}

export function StartPositionFields({ draft, disabled, onChange }: Props) {
  const mode = resolveDraftStartMode(draft);
  const selectMode = (startMode: KafkaStartMode) => onChange({ startMode, fromBeginning: startMode === 'beginning' });

  return (
    <>
      <FormField label="Start position">
        {() => <OptionSelect value={mode} options={START_MODE_OPTIONS} onValueChange={selectMode} ariaLabel="Start position" />}
      </FormField>
      {mode === 'offset' && (
        <FormField label="Offsets (partition:offset, comma separated)">
          {(id) => <Input id={id} value={draft.startOffsets ?? ''} placeholder="0:120, 1:98 or 250" disabled={disabled} onChange={(event) => onChange({ startOffsets: event.target.value })} />}
        </FormField>
      )}
      {mode === 'timestamp' && (
        <FormField label="From timestamp (ISO date or epoch ms)">
          {(id) => <Input id={id} value={draft.startTimestamp ?? ''} placeholder="2024-05-01T10:00:00Z" disabled={disabled} onChange={(event) => onChange({ startTimestamp: event.target.value })} />}
        </FormField>
      )}
      {mode === 'lastN' && (
        <FormField label="Messages per partition">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              value={draft.startLastN ?? DEFAULT_LAST_N}
              disabled={disabled}
              onChange={(event) => onChange({ startLastN: Number(event.target.value) })}
            />
          )}
        </FormField>
      )}
    </>
  );
}
