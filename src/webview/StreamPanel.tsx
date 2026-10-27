import { requestKindOf, usesEventLog } from '../core/requestKinds';
import { RequestModel } from '../shared/types';
import { GrpcStatusBar } from './GrpcStatusBar';
import { ConnectionBar } from './ConnectionBar';
import { EventLogPanel } from './EventLogPanel';
import { StreamState } from './useStream';
import { Button } from './components/ui/button';
import { postToHost } from './vscodeApi';
import { WebSocketPanel } from './WebSocketPanel';

interface Props {
  request: RequestModel;
  stream: StreamState;
  grpcMethodStreamsRequests: boolean;
}

export function StreamPanel({ request, stream, grpcMethodStreamsRequests }: Props) {
  const grpc = requestKindOf(request) === 'grpc';
  const connect = () => postToHost({ type: 'streamConnect', request });
  const disconnect = () => postToHost({ type: 'streamDisconnect' });
  return (
    <div className="response">
      <ConnectionBar
        status={stream.status}
        detail={stream.detail}
        onConnect={connect}
        onDisconnect={disconnect}
        canConnect={request.url.trim() !== ''}
        connectLabel={grpc ? 'Invoke' : undefined}
        disconnectLabel={grpc ? 'Cancel' : undefined}
      />
      {grpc && <GrpcStatusBar status={stream.grpcStatus} />}
      {grpc ? (
        <WebSocketPanel
          status={stream.status}
          entries={stream.webSocketLog}
          onClear={stream.clearLog}
          hideComposer={!grpcMethodStreamsRequests}
          composerActions={
            <Button variant="secondary" disabled={stream.status !== 'open'} onClick={() => postToHost({ type: 'grpcEnd' })}>
              End stream
            </Button>
          }
        />
      ) : usesEventLog(request) ? (
        <EventLogPanel entries={stream.sseLog} onClear={stream.clearLog} />
      ) : (
        <WebSocketPanel status={stream.status} entries={stream.webSocketLog} onClear={stream.clearLog} />
      )}
    </div>
  );
}

export function streamTitle(request: RequestModel): string {
  const kind = requestKindOf(request);
  return kind === 'websocket' || kind === 'grpc' ? 'Messages' : 'Events';
}
