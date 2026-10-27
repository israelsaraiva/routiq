import { useCallback, useEffect, useState } from 'react';
import { prependMessages } from '../../core/kafka/messageList';
import { KafkaCollectionOption, KafkaHostMessage, KafkaLogFile, KafkaMessage, KafkaProduceResult, KafkaProfileView, KafkaStatus } from '../../shared/types';
import { postKafkaMessage } from '../vscodeApi';

export interface KafkaHostState {
  ready: boolean;
  profiles: KafkaProfileView[];
  activeProfileId?: string;
  collections: KafkaCollectionOption[];
  maxMessages: number;
  status: KafkaStatus;
  messages: KafkaMessage[];
  logFile?: KafkaLogFile;
  produceResult?: KafkaProduceResult;
}

const INITIAL_STATE: KafkaHostState = {
  ready: false,
  profiles: [],
  collections: [],
  maxMessages: 1000,
  status: { state: 'disconnected' },
  messages: [],
};

export function reduceHostMessage(state: KafkaHostState, message: KafkaHostMessage): KafkaHostState {
  switch (message.type) {
    case 'kafkaInit': {
      const { type: _type, ...init } = message;
      return { ...state, ...init, ready: true };
    }
    case 'kafkaProfiles':
      return { ...state, profiles: message.profiles, activeProfileId: message.activeProfileId };
    case 'kafkaStatus':
      return { ...state, status: message.status };
    case 'kafkaMessages':
      return { ...state, messages: message.replace ? message.messages : prependMessages(state.messages, message.messages, state.maxMessages) };
    case 'kafkaProduceResult':
      return { ...state, produceResult: message.result };
    case 'kafkaLogFile':
      return { ...state, logFile: message.logFile };
  }
}

export function useKafkaHost(): KafkaHostState {
  const [state, setState] = useState<KafkaHostState>(INITIAL_STATE);
  const apply = useCallback((message: KafkaHostMessage) => setState((current) => reduceHostMessage(current, message)), []);

  useEffect(() => {
    const onMessage = (event: MessageEvent<KafkaHostMessage>) => event.data?.type?.startsWith('kafka') && apply(event.data);
    window.addEventListener('message', onMessage);
    postKafkaMessage({ type: 'kafkaReady' });
    return () => window.removeEventListener('message', onMessage);
  }, [apply]);

  return state;
}
