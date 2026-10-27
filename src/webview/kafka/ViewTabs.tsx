import { Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { KafkaFilterView } from '../../shared/kafkaMessageTypes';
import { Icon } from '../Icon';
import { IconButton } from '../components/IconButton';
import { Button } from '../components/ui/button';

interface Props {
  views: KafkaFilterView[];
  activeId: string | null;
  canAdd: boolean;
  onSelect: (viewId: string | null) => void;
  onAdd: () => void;
  onClose: (viewId: string) => void;
}

export function ViewTabs({ views, activeId, canAdd, onSelect, onAdd, onClose }: Props) {
  return (
    <div className="kafka-view-tabs" role="tablist" aria-label="Message views">
      <Button role="tab" aria-selected={activeId === null} variant={activeId === null ? 'default' : 'secondary'} size="sm" onClick={() => onSelect(null)}>
        All messages
      </Button>
      {views.map((view) => (
        <span key={view.id} className="kafka-view-tab">
          <Button role="tab" aria-selected={activeId === view.id} variant={activeId === view.id ? 'default' : 'secondary'} size="sm" onClick={() => onSelect(view.id)}>
            {view.name}
          </Button>
          <IconButton icon={Cancel01Icon} label={`Close view ${view.name}`} compact onClick={() => onClose(view.id)} />
        </span>
      ))}
      <Button variant="ghost" size="sm" disabled={!canAdd} title="Save the current filter as a new tab" onClick={onAdd}>
        <Icon icon={Add01Icon} /> New view
      </Button>
    </div>
  );
}
