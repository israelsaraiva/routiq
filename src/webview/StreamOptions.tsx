import { RequestKind, RequestModel } from '../shared/types';
import { AutocompleteInput } from './AutocompleteInput';
import { LabeledSwitch } from './components/LabeledSwitch';

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
        <AutocompleteInput
          className="filter-input"
          placeholder="Subprotocols (comma separated)"
          ariaLabel="Subprotocols"
          value={request.subprotocols ?? ''}
          onChange={(subprotocols) => onChange({ subprotocols })}
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
