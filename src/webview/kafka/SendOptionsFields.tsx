import { ACKS_OPTIONS, COMPRESSION_OPTIONS, SendDraft } from '../../core/kafka/sendJob';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { Input } from '../components/ui/input';
import { FormField } from './FormField';

interface Props {
  draft: SendDraft;
  onPatch: (changes: Partial<SendDraft>) => void;
}

export function SendOptionsFields({ draft, onPatch }: Props) {
  return (
    <fieldset className="kafka-send-options">
      <FormField label="Partition (empty = auto)">
        {(id) => <Input id={id} inputMode="numeric" placeholder="auto" value={draft.partition} onChange={(event) => onPatch({ partition: event.target.value })} />}
      </FormField>
      <FormField label="Copies">{(id) => <Input id={id} inputMode="numeric" value={draft.count} onChange={(event) => onPatch({ count: event.target.value })} />}</FormField>
      <FormField label="Delay between messages (ms)">
        {(id) => <Input id={id} inputMode="numeric" placeholder="0" value={draft.delayMs} onChange={(event) => onPatch({ delayMs: event.target.value })} />}
      </FormField>
      <FormField label="Rate limit (messages/s)">
        {(id) => <Input id={id} inputMode="decimal" placeholder="unlimited" value={draft.ratePerSecond} onChange={(event) => onPatch({ ratePerSecond: event.target.value })} />}
      </FormField>
      <FormField label="Compression">
        {() => <OptionSelect value={draft.compression} options={COMPRESSION_OPTIONS} onValueChange={(compression) => onPatch({ compression })} ariaLabel="Compression" />}
      </FormField>
      <FormField label="Acknowledgements">
        {() => <OptionSelect value={draft.acks} options={ACKS_OPTIONS} onValueChange={(acks) => onPatch({ acks })} ariaLabel="Acknowledgements" />}
      </FormField>
      <LabeledSwitch label="Tombstone (null value)" checked={draft.tombstone} onCheckedChange={(tombstone) => onPatch({ tombstone })} />
      <LabeledSwitch label="Repeat on an interval" checked={draft.repeat} onCheckedChange={(repeat) => onPatch({ repeat })} />
      {draft.repeat && (
        <>
          <FormField label="Repeat every (seconds)">
            {(id) => <Input id={id} inputMode="decimal" value={draft.repeatIntervalSeconds} onChange={(event) => onPatch({ repeatIntervalSeconds: event.target.value })} />}
          </FormField>
          <FormField label="Stop after (runs)">
            {(id) => <Input id={id} inputMode="numeric" value={draft.repeatMaxRuns} onChange={(event) => onPatch({ repeatMaxRuns: event.target.value })} />}
          </FormField>
        </>
      )}
    </fieldset>
  );
}
