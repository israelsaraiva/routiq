import { RequestKind, RequestModel } from '../shared/types';
import { LabeledSwitch } from './components/LabeledSwitch';
import { Input } from './components/ui/input';

interface Props {
  request: RequestModel;
  kind: RequestKind;
  onChange: (patch: Partial<RequestModel>) => void;
}

export function StreamOptions({ request, kind, onChange }: Props) {
  if (kind === 'http') {
    return (
      <LabeledSwitch
        label="Stream"
        title="Read the response as a live Server-Sent Events stream"
        checked={request.stream === true}
        onCheckedChange={(stream) => onChange({ stream })}
      />
    );
  }
  return (
    <div className="response-toolbar">
      {kind === 'websocket' && (
        <Input
          className="filter-input"
          placeholder="Subprotocols (comma separated)"
          value={request.subprotocols ?? ''}
          onChange={(event) => onChange({ subprotocols: event.target.value })}
        />
      )}
      <LabeledSwitch
        label="Auto-reconnect"
        checked={request.autoReconnect === true}
        onCheckedChange={(autoReconnect) => onChange({ autoReconnect })}
      />
    </div>
  );
}
