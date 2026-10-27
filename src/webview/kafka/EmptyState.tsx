import { Button } from '../components/ui/button';

interface Props {
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, hint, actionLabel, onAction }: Props) {
  return (
    <div className="kafka-empty-state" data-testid="kafka-empty-state">
      <p className="kafka-empty-title">{title}</p>
      <p className="kafka-hint">{hint}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
