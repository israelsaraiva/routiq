import { StreamHistorySession } from '../shared/types';
import { formatLogTime } from '../core/streamLog';
import { GrpcStatusBar } from './GrpcStatusBar';
import { Badge } from './components/ui/badge';
import { ScrollArea } from './components/ui/scroll-area';

interface Props {
  session: StreamHistorySession;
}

export function describeMessageCount({ messages, totalMessages, truncated }: StreamHistorySession): string {
  return truncated ? `Showing first ${messages.length} of ${totalMessages} messages` : `${totalMessages} message(s)`;
}

export function HistoryTranscript({ session }: Props) {
  return (
    <div className="history-transcript">
      <div className="response-toolbar">
        <span className="stream-detail">{describeMessageCount(session)}</span>
        {session.closeDetail && <span className="stream-detail">{session.closeDetail}</span>}
      </div>
      <GrpcStatusBar status={session.grpcStatus} />
      <ScrollArea className="history-transcript-log">
        {session.messages.map((message, index) => (
          <div key={index} className="history-transcript-row">
            <span className="history-time">{formatLogTime(message.timestamp)}</span>
            <Badge variant="outline">{message.direction === 'sent' ? '↑ sent' : '↓ received'}</Badge>
            {message.label && <Badge variant="secondary">{message.label}</Badge>}
            <pre className="history-transcript-text">{message.text}</pre>
          </div>
        ))}
        {session.messages.length === 0 && <div className="placeholder">No messages were exchanged.</div>}
      </ScrollArea>
    </div>
  );
}
