import { Delete02Icon } from '@hugeicons/core-free-icons';
import { LabeledSwitch } from './components/LabeledSwitch';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Icon } from './Icon';

interface Props {
  filter: string;
  onFilterChange: (filter: string) => void;
  autoScroll: boolean;
  onAutoScrollChange: (autoScroll: boolean) => void;
  onClear: () => void;
  visibleCount: number;
  totalCount: number;
}

export function LogToolbar({ filter, onFilterChange, autoScroll, onAutoScrollChange, onClear, visibleCount, totalCount }: Props) {
  return (
    <div className="response-toolbar">
      <Input
        className="filter-input"
        placeholder="Filter messages"
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
      />
      <span className="match-count">
        {visibleCount}/{totalCount}
      </span>
      <LabeledSwitch label="Auto-scroll" checked={autoScroll} onCheckedChange={onAutoScrollChange} />
      <Button variant="secondary" onClick={onClear} disabled={totalCount === 0}>
        <Icon icon={Delete02Icon} />
        Clear
      </Button>
    </div>
  );
}
