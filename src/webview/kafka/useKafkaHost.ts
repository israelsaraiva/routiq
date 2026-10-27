import { useCallback, useEffect, useState } from 'react';
import { MessageBatcher, animationFrameScheduler } from '../../core/kafka/messageBatcher';
import { prependMessages, replaceMessageById } from '../../core/kafka/messageList';
import { KafkaDecodedValue, KafkaUiState } from '../../shared/kafkaMessageTypes';
import { KafkaJobProgress, KafkaSendTemplate } from '../../shared/kafkaProduceTypes';
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
  jobProgress?: KafkaJobProgress;
  templates?: KafkaSendTemplate[];
  ui?: KafkaUiState;
  decodedValues?: Record<string, KafkaDecodedValue>;
}

const MAX_PENDING_MESSAGES = 10000;

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
    case 'kafkaFullMessage':
      return { ...state, messages: replaceMessageById(state.messages, message.message) };
    case 'kafkaProduceResult':
      return { ...state, produceResult: message.result };
    case 'kafkaLogFile':
      return { ...state, logFile: message.logFile };
    case 'kafkaJobProgress':
      return { ...state, jobProgress: message.progress };
    case 'kafkaTemplates':
      return { ...state, templates: message.templates };
    case 'kafkaUiState':
      return { ...state, ui: message.ui };
    case 'kafkaDecoded':
      return { ...state, decodedValues: { ...state.decodedValues, [message.messageId]: message.decoded } };
  }
}

export function useKafkaHost(): KafkaHostState {
  const [state, setState] = useState<KafkaHostState>(INITIAL_STATE);
  const apply = useCallback((message: KafkaHostMessage) => setState((current) => reduceHostMessage(current, message)), []);

  useEffect(() => {
    const batcher = new MessageBatcher<KafkaMessage>(
      (messages) => apply({ type: 'kafkaMessages', messages, replace: false }),
      animationFrameScheduler,
      MAX_PENDING_MESSAGES,
    );
    const onMessage = (event: MessageEvent<KafkaHostMessage>) => {
      const data = event.data;
      if (!data?.type?.startsWith('kafka')) {
        return;
      }
      if (data.type === 'kafkaMessages' && !data.replace) {
        data.messages.forEach((message) => batcher.push(message));
        return;
      }
      batcher.flush();
      apply(data);
    };
    window.addEventListener('message', onMessage);
    postKafkaMessage({ type: 'kafkaReady' });
    return () => {
      window.removeEventListener('message', onMessage);
      batcher.discard();
    };
  }, [apply]);

  return state;
}
