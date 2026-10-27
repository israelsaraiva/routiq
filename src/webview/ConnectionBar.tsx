import { PlayIcon, StopIcon } from '@hugeicons/core-free-icons';
import { StreamStatus } from '../shared/types';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Icon } from './Icon';

interface Props {
  status: StreamStatus;
  detail?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  connectLabel?: string;
  disconnectLabel?: string;
  canConnect?: boolean;
}

const STATUS_LABELS: Record<StreamStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  open: 'Connected',
  closed: 'Disconnected',
  error: 'Error',
};

const STATUS_CLASSES: Record<StreamStatus, string> = {
  idle: '',
  connecting: 'status-warn',
  open: 'status-ok',
  closed: '',
  error: 'status-error',
};

export function ConnectionBar({ status, detail, onConnect, onDisconnect, connectLabel = 'Connect', disconnectLabel = 'Disconnect', canConnect = true }: Props) {
  const active = status === 'connecting' || status === 'open';
  return (
    <div className="response-toolbar">
      {active ? (
        <Button onClick={onDisconnect}>
          <Icon icon={StopIcon} />
          {disconnectLabel}
        </Button>
      ) : (
        <Button onClick={onConnect} disabled={!canConnect}>
          <Icon icon={PlayIcon} />
          {connectLabel}
        </Button>
      )}
      <Badge variant="status" className={STATUS_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>
      {detail && <span className="stream-detail">{detail}</span>}
    </div>
  );
}
