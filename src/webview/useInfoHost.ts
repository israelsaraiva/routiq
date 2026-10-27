import { useEffect, useState } from 'react';
import { AboutInfo, InfoHostMessage, InfoLink } from '../core/infoMessages';
import { postInfoMessage } from './vscodeApi';

interface InfoState {
  about?: AboutInfo;
  links: InfoLink[];
}

export function useInfoHost(): InfoState {
  const [state, setState] = useState<InfoState>({ links: [] });

  useEffect(() => {
    const onMessage = (event: MessageEvent<InfoHostMessage>) => {
      if (event.data?.type === 'infoLoad') {
        setState({ about: event.data.about, links: event.data.links });
      }
    };
    window.addEventListener('message', onMessage);
    postInfoMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return state;
}
