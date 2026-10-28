import { KafkaMessage } from '../../shared/types';
import { MessageActions, MessageCard } from './MessageCard';
import { VirtualList } from './VirtualList';

const ESTIMATED_ROW_HEIGHT = 40;

interface Props extends MessageActions {
  messages: KafkaMessage[];
  selectedIds: Set<string>;
  onToggleSelected: (messageIds: string[], selected: boolean) => void;
}

const getMessageKey = (message: KafkaMessage) => message.id;

export function FlatMessageList({ messages, selectedIds, onToggleSelected, ...messageActions }: Props) {
  return (
    <VirtualList
      className="kafka-flat-messages"
      items={messages}
      getKey={getMessageKey}
      estimatedHeight={ESTIMATED_ROW_HEIGHT}
      renderItem={(message) => (
        <MessageCard
          key={message.id}
          message={message}
          selected={selectedIds.has(message.id)}
          onSelectedChange={(selected) => onToggleSelected([message.id], selected)}
          {...messageActions}
        />
      )}
    />
  );
}
