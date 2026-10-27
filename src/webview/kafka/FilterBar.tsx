import { Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { generateId } from '../../core/ids';
import { EMPTY_FILTER, advancedFilterCount, compileFilter, formatDateTimeLocal, isFilterActive, parseDateTimeLocal, validateJsonPathCondition } from '../../core/kafka/messageFilter';
import { KafkaFilterScope, KafkaMessageFilter, KafkaSavedFilter } from '../../shared/kafkaMessageTypes';
import { IconButton } from '../components/IconButton';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const SCOPE_OPTIONS: Array<{ value: KafkaFilterScope; label: string }> = [
  { value: 'all', label: 'All fields' },
  { value: 'key', label: 'Key' },
  { value: 'value', label: 'Value' },
  { value: 'headers', label: 'Headers' },
];

interface Props {
  filter: KafkaMessageFilter;
  onChange: (filter: KafkaMessageFilter) => void;
  savedFilters: KafkaSavedFilter[];
  onSavedFiltersChange: (filters: KafkaSavedFilter[]) => void;
}

export function FilterBar({ filter, onChange, savedFilters, onSavedFiltersChange }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const patch = (changes: Partial<KafkaMessageFilter>) => onChange({ ...filter, ...changes });
  const advancedCount = advancedFilterCount(filter);
  const error = compileFilter(filter).error ?? validateJsonPathCondition(filter.jsonPath);

  return (
    <div className="kafka-filter">
      <div className="kafka-toolbar">
        <Input aria-label="Search messages" placeholder="Search value, topic, flowId, key, headers…" value={filter.text} onChange={(event) => patch({ text: event.target.value })} />
        <Button variant={filter.regex ? 'default' : 'secondary'} size="sm" aria-pressed={filter.regex} title="Use regular expression" onClick={() => patch({ regex: !filter.regex })}>
          .*
        </Button>
        <Button variant={filter.caseSensitive ? 'default' : 'secondary'} size="sm" aria-pressed={filter.caseSensitive} title="Match case" onClick={() => patch({ caseSensitive: !filter.caseSensitive })}>
          Aa
        </Button>
        <OptionSelect value={filter.scope} options={SCOPE_OPTIONS} onValueChange={(scope) => patch({ scope })} ariaLabel="Search scope" />
        <Button variant="secondary" size="sm" aria-expanded={showAdvanced} onClick={() => setShowAdvanced(!showAdvanced)}>
          Filters{advancedCount > 0 ? ` (${advancedCount})` : ''}
        </Button>
        <Button variant="ghost" size="sm" disabled={!isFilterActive(filter)} onClick={() => onChange(EMPTY_FILTER)}>
          Reset
        </Button>
      </div>
      {error && <p className="kafka-error kafka-filter-error">{error}</p>}
      {showAdvanced && <AdvancedFilters filter={filter} patch={patch} />}
      <SavedFilters filter={filter} savedFilters={savedFilters} onApply={onChange} onChange={onSavedFiltersChange} />
    </div>
  );
}

interface AdvancedProps {
  filter: KafkaMessageFilter;
  patch: (changes: Partial<KafkaMessageFilter>) => void;
}

function AdvancedFilters({ filter, patch }: AdvancedProps) {
  return (
    <div className="kafka-filter-advanced">
      <Input aria-label="JSON path condition" placeholder="$.status == 'FAILED'" value={filter.jsonPath} onChange={(event) => patch({ jsonPath: event.target.value })} />
      <Input aria-label="Header key" placeholder="Header key" value={filter.headerKey} onChange={(event) => patch({ headerKey: event.target.value })} />
      <Input aria-label="Header value" placeholder="Header value contains" value={filter.headerValue} onChange={(event) => patch({ headerValue: event.target.value })} />
      <Input
        aria-label="Partition"
        type="number"
        min={0}
        placeholder="Partition"
        value={filter.partition ?? ''}
        onChange={(event) => patch({ partition: event.target.value === '' ? null : Number(event.target.value) })}
      />
      <Input aria-label="From time" type="datetime-local" value={formatDateTimeLocal(filter.fromTime)} onChange={(event) => patch({ fromTime: parseDateTimeLocal(event.target.value) })} />
      <Input aria-label="To time" type="datetime-local" value={formatDateTimeLocal(filter.toTime)} onChange={(event) => patch({ toTime: parseDateTimeLocal(event.target.value) })} />
      <LabeledSwitch label="Errors only" checked={filter.errorsOnly} onCheckedChange={(errorsOnly) => patch({ errorsOnly })} />
    </div>
  );
}

interface SavedProps {
  filter: KafkaMessageFilter;
  savedFilters: KafkaSavedFilter[];
  onApply: (filter: KafkaMessageFilter) => void;
  onChange: (filters: KafkaSavedFilter[]) => void;
}

function SavedFilters({ filter, savedFilters, onApply, onChange }: SavedProps) {
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const trimmed = name.trim();

  const save = () => {
    const renamed = renamingId ? savedFilters.map((saved) => (saved.id === renamingId ? { ...saved, name: trimmed } : saved)) : undefined;
    onChange(renamed ?? [...savedFilters, { id: generateId(), name: trimmed, filter }]);
    setName('');
    setRenamingId(null);
  };

  return (
    <div className="kafka-saved-filters">
      {savedFilters.map((saved) => (
        <span key={saved.id} className="kafka-saved-filter">
          <Button variant="secondary" size="sm" onClick={() => onApply(saved.filter)}>
            {saved.name}
          </Button>
          <IconButton
            icon={Edit02Icon}
            label={`Rename filter ${saved.name}`}
            compact
            onClick={() => {
              setRenamingId(saved.id);
              setName(saved.name);
            }}
          />
          <IconButton icon={Delete02Icon} label={`Delete filter ${saved.name}`} compact onClick={() => onChange(savedFilters.filter((candidate) => candidate.id !== saved.id))} />
        </span>
      ))}
      <Input aria-label="Saved filter name" placeholder="Name this filter" value={name} onChange={(event) => setName(event.target.value)} />
      <Button variant="secondary" size="sm" disabled={!trimmed || (!renamingId && !isFilterActive(filter))} onClick={save}>
        {renamingId ? 'Rename' : 'Save filter'}
      </Button>
    </div>
  );
}
