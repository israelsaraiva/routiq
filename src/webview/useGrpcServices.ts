import { useEffect, useState } from 'react';
import { GrpcServiceDescription, HostToWebviewMessage } from '../shared/types';

export interface GrpcServicesState {
  services: GrpcServiceDescription[];
  loadError?: string;
}

export function useGrpcServices(): GrpcServicesState {
  const [state, setState] = useState<GrpcServicesState>({ services: [] });

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'grpcServices') {
        setState({ services: message.services, loadError: message.error });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return state;
}
