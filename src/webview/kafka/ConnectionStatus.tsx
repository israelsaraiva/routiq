import { Alert02Icon, CheckmarkCircle02Icon, Loading03Icon, MinusSignCircleIcon, PlayIcon, StopIcon } from '@hugeicons/core-free-icons';
import { IconSvgElement } from '@hugeicons/react';
import { KafkaConnectionState, KafkaMessage, KafkaStatus } from '../../shared/types';
import { Icon } from '../Icon';
import { Button } from '../components/ui/button';

const RATE_WINDOW_MS = 10_000;

const PRESENTATION: Record<KafkaConnectionState, { label: string; icon: IconSvgElement }> = {
  connected: { label: 'Connected', icon: CheckmarkCircle02Icon },
  connecting: { label: 'Connecting', icon: Loading03Icon },
  reconnecting: { label: 'Reconnecting', icon: Loading03Icon },
  error: { label: 'Error', icon: Alert02Icon },
  disconnected: { label: 'Disconnected', icon: MinusSignCircleIcon },
};

interface Props {
  status: KafkaStatus;
  messages: KafkaMessage[];
  onConnect: () => void;
  onDisconnect: () => void;
  now?: number;
}

export function statusLabel(status: KafkaStatus): string {
  const { label } = PRESENTATION[status.state];
  return status.state === 'reconnecting' && status.attempt ? `${label} (attempt ${status.attempt})` : label;
}

export function messagesPerSecond(messages: KafkaMessage[], now: number): number {
  const recent = messages.filter((message) => now - (message.receivedAt ?? message.timestamp) <= RATE_WINDOW_MS).length;
  return recent / (RATE_WINDOW_MS / 1000);
}

function isActive(state: KafkaConnectionState): boolean {
  return state === 'connected' || state === 'connecting' || state === 'reconnecting';
}

export function ConnectionStatus({ status, messages, onConnect, onDisconnect, now = Date.now() }: Props) {
  const { icon } = PRESENTATION[status.state];
  const rate = messagesPerSecond(messages, now);

  return (
    <div className="kafka-statusbar" data-testid="kafka-statusbar">
      <span className="kafka-status" data-state={status.state} role="status">
        <span className="kafka-status-dot" aria-hidden="true" />
        <Icon icon={icon} size={14} />
        <span className="kafka-status-label">{statusLabel(status)}</span>
        {status.detail && <span className="kafka-status-detail">{status.detail}</span>}
      </span>
      <span className="kafka-status-metrics">
        <span>{messages.length} received</span>
        {status.state === 'connected' && <span>{rate.toFixed(1)} msg/s</span>}
      </span>
      {isActive(status.state) ? (
        <Button variant="destructive" size="sm" onClick={onDisconnect}>
          <Icon icon={StopIcon} /> {status.state === 'reconnecting' ? 'Stop reconnecting' : 'Disconnect'}
        </Button>
      ) : (
        <Button size="sm" onClick={onConnect}>
          <Icon icon={PlayIcon} /> Connect
        </Button>
      )}
    </div>
  );
}
