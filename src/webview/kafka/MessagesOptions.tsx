import { Settings02Icon } from '@hugeicons/core-free-icons';
import { KafkaMessageViewMode } from '../../shared/kafkaMessageTypes';
import { Icon } from '../Icon';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { Button } from '../components/ui/button';
import { useStoredFlag } from './useStoredFlag';

const OPTIONS_STORAGE_KEY = 'routiq.kafka.optionsOpen';
const VIEW_MODES: Array<{ mode: KafkaMessageViewMode; label: string }> = [
  { mode: 'tree', label: 'Tree' },
  { mode: 'text', label: 'Text' },
  { mode: 'raw', label: 'Raw' },
];

interface Props {
  followNewest: boolean;
  onFollowNewestChange: (follow: boolean) => void;
  viewMode: KafkaMessageViewMode;
  onViewModeChange: (mode: KafkaMessageViewMode) => void;
}

export function useOptionsOpen(): [boolean, (open: boolean) => void] {
  return useStoredFlag(OPTIONS_STORAGE_KEY, false);
}

export function OptionsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button variant={open ? 'default' : 'secondary'} size="sm" aria-expanded={open} aria-controls="kafka-options" onClick={onToggle}>
      <Icon icon={Settings02Icon} /> Options
    </Button>
  );
}

export function MessagesOptions({ followNewest, onFollowNewestChange, viewMode, onViewModeChange }: Props) {
  return (
    <div id="kafka-options" className="kafka-options" role="group" aria-label="Message options">
      <LabeledSwitch label="Follow newest" checked={followNewest} onCheckedChange={onFollowNewestChange} />
      <div className="kafka-value-modes" role="group" aria-label="Value view mode">
        <span className="kafka-hint">Value view</span>
        {VIEW_MODES.map(({ mode, label }) => (
          <Button key={mode} variant={viewMode === mode ? 'default' : 'secondary'} size="sm" aria-pressed={viewMode === mode} onClick={() => onViewModeChange(mode)}>
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
