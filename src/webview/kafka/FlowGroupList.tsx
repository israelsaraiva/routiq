import { ArrowDown01Icon, ArrowRight01Icon, Copy01Icon, Delete02Icon, Download01Icon } from '@hugeicons/core-free-icons';
import { Fragment, useState } from 'react';
import { formatTimeDelta } from '../../core/kafka/timeDelta';
import { FlowGroup, flowDurationSeconds, isLinkedFlow } from '../../core/kafka/flowGroups';
import { KafkaMessage } from '../../shared/types';
import { ConfirmAction } from '../components/ConfirmAction';
import { IconButton } from '../components/IconButton';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { MessageActions, MessageCard } from './MessageCard';
import { VirtualList } from './VirtualList';

export interface FlowActions extends MessageActions {
  onCopyFlow: (group: FlowGroup) => void;
  onDownloadFlow: (group: FlowGroup) => void;
  onDeleteFlow?: (group: FlowGroup) => void;
}

interface Props extends FlowActions {
  groups: FlowGroup[];
  selectedIds: Set<string>;
  onToggleSelected: (messageIds: string[], selected: boolean) => void;
}

export function FlowGroupList({ groups, selectedIds, onToggleSelected, onCopyFlow, onDownloadFlow, onDeleteFlow, ...messageActions }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (flowId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(flowId) || next.add(flowId);
      return next;
    });

  return (
    <VirtualList
      className="kafka-flows"
      items={groups}
      getKey={(group) => group.flowId}
      renderItem={(group) => (
        <FlowGroupSection
          key={group.flowId}
          group={group}
          collapsed={collapsed.has(group.flowId)}
          selectedIds={selectedIds}
          onToggleCollapsed={() => toggleCollapsed(group.flowId)}
          onToggleSelected={onToggleSelected}
          onCopyFlow={onCopyFlow}
          onDownloadFlow={onDownloadFlow}
          onDeleteFlow={onDeleteFlow}
          {...messageActions}
        />
      )}
    />
  );
}

interface SectionProps extends FlowActions {
  group: FlowGroup;
  collapsed: boolean;
  selectedIds: Set<string>;
  onToggleCollapsed: () => void;
  onToggleSelected: (messageIds: string[], selected: boolean) => void;
}

function FlowGroupSection({ group, collapsed, selectedIds, onToggleCollapsed, onToggleSelected, onCopyFlow, onDownloadFlow, onDeleteFlow, ...messageActions }: SectionProps) {
  const ids = group.messages.map((message: KafkaMessage) => message.id);
  const allSelected = ids.every((id) => selectedIds.has(id));

  return (
    <section className="kafka-flow" data-testid="kafka-flow">
      <header className="kafka-flow-header">
        <Checkbox checked={allSelected} onCheckedChange={(checked) => onToggleSelected(ids, checked === true)} aria-label={`Select flow ${group.flowId}`} />
        <IconButton icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon} label={collapsed ? 'Expand flow' : 'Collapse flow'} compact onClick={onToggleCollapsed} />
        <code className="kafka-flow-id">{group.flowId}</code>
        <Badge variant={isLinkedFlow(group.flowId) ? 'info' : 'secondary'}>{group.messages.length} msg</Badge>
        {group.messages.length > 1 && <Badge variant="outline">{flowDurationSeconds(group)}s</Badge>}
        <div className="kafka-message-actions">
          <IconButton icon={Copy01Icon} label="Copy flow" compact onClick={() => onCopyFlow(group)} />
          <IconButton icon={Download01Icon} label="Download flow" compact onClick={() => onDownloadFlow(group)} />
          {onDeleteFlow && (
            <ConfirmAction
              trigger={<IconButton icon={Delete02Icon} label="Delete flow" compact />}
              title="Delete flow"
              description={`Delete ${group.messages.length} message(s) of flow ${group.flowId}?`}
              confirmLabel="Delete"
              onConfirm={() => onDeleteFlow(group)}
            />
          )}
        </div>
      </header>
      {!collapsed && (
        <div className="kafka-flow-steps">
          {group.messages.map((message, index) => (
            <Fragment key={message.id}>
              {index > 0 && <FlowDelta previous={group.messages[index - 1]} next={message} />}
              <MessageCard
                message={message}
                selected={selectedIds.has(message.id)}
                onSelectedChange={(selected) => onToggleSelected([message.id], selected)}
                {...messageActions}
              />
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}

function FlowDelta({ previous, next }: { previous: KafkaMessage; next: KafkaMessage }) {
  return (
    <div className="kafka-flow-delta" aria-label="Time since previous step">
      {formatTimeDelta(next.timestamp - previous.timestamp)}
    </div>
  );
}
