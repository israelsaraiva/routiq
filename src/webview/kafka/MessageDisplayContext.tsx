import { createContext, useContext } from 'react';
import { KafkaDecodedValue, KafkaHighlightRule, KafkaMessageViewMode, KafkaValueFormat } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';

export interface MessageDisplay {
  viewMode: KafkaMessageViewMode;
  onViewModeChange: (mode: KafkaMessageViewMode) => void;
  highlightTerm: string;
  rules: KafkaHighlightRule[];
  decodedValues: Record<string, KafkaDecodedValue>;
  onDecode: (message: KafkaMessage, format: KafkaValueFormat) => void;
  onSaveAsRequest: (messages: KafkaMessage[]) => void;
}

const DEFAULT_DISPLAY: MessageDisplay = {
  viewMode: 'tree',
  onViewModeChange: () => undefined,
  highlightTerm: '',
  rules: [],
  decodedValues: {},
  onDecode: () => undefined,
  onSaveAsRequest: () => undefined,
};

export const MessageDisplayContext = createContext<MessageDisplay>(DEFAULT_DISPLAY);

export function useMessageDisplay(): MessageDisplay {
  return useContext(MessageDisplayContext);
}
