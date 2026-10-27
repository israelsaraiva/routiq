import { GrpcCallStatus } from '../shared/types';
import { Badge } from './components/ui/badge';

interface Props {
  status?: GrpcCallStatus;
}

export function GrpcStatusBar({ status }: Props) {
  if (!status) {
    return null;
  }
  return (
    <div className="response-toolbar">
      <Badge variant="status" className={status.code === 0 ? 'status-ok' : 'status-error'}>
        {status.code} {status.codeName}
      </Badge>
      {status.details && <span className="stream-detail">{status.details}</span>}
      {status.trailers.map(([key, value]) => (
        <span className="stream-detail" key={key}>
          {key}: {value}
        </span>
      ))}
    </div>
  );
}
