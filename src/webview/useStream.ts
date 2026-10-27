import { useCallback, useEffect, useState } from 'react';
import { appendCapped } from '../core/streamLog';
import { GrpcCallStatus, HostToWebviewMessage, SseLogEntry, StreamStatus, WebSocketLogEntry } from '../shared/types';

export interface StreamState {
  status: StreamStatus;
  detail?: string;
  sseLog: SseLogEntry[];
  webSocketLog: WebSocketLogEntry[];
  grpcStatus?: GrpcCallStatus;
  clearLog: () => void;
}

export function useStream(): StreamState {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [detail, setDetail] = useState<string>();
  const [sseLog, setSseLog] = useState<SseLogEntry[]>([]);
  const [webSocketLog, setWebSocketLog] = useState<WebSocketLogEntry[]>([]);
  const [grpcStatus, setGrpcStatus] = useState<GrpcCallStatus>();

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'streamStatus') {
        setStatus(message.status);
        if (message.status === 'connecting') {
          setGrpcStatus(undefined);
        }
        setDetail(message.detail);
      } else if (message.type === 'sseEvent') {
        setSseLog((log) => appendCapped(log, message.entry));
      } else if (message.type === 'grpcStatus') {
        setGrpcStatus(message.status);
      } else if (message.type === 'wsMessage') {
        setWebSocketLog((log) => appendCapped(log, message.entry));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const clearLog = useCallback(() => {
    setSseLog([]);
    setWebSocketLog([]);
    setGrpcStatus(undefined);
  }, []);

  return { status, detail, sseLog, webSocketLog, grpcStatus, clearLog };
}
