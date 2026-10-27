import { Fragment, useState } from 'react';
import { Delete02Icon } from '@hugeicons/core-free-icons';
import { KafkaTopicConfigEntry, KafkaTopicInfo } from '../../../shared/kafkaAdminTypes';
import { Icon } from '../../Icon';
import { ConfirmAction } from '../../components/ConfirmAction';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { TopicDetail } from './TopicDetail';

interface Props {
  topics: KafkaTopicInfo[];
  configs: Record<string, KafkaTopicConfigEntry[]>;
  onLoadConfigs: (topic: string) => void;
  onAddToListener: (topic: string) => void;
  onConsume: (topic: string) => void;
  onDelete: (topic: string) => void;
}

const COLUMN_COUNT = 5;

export function TopicTable({ topics, configs, onLoadConfigs, onAddToListener, onConsume, onDelete }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (topic: string) => {
    setExpanded(expanded === topic ? null : topic);
    expanded !== topic && onLoadConfigs(topic);
  };

  if (topics.length === 0) {
    return <div className="kafka-empty">No topics match.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Topic</TableHead>
          <TableHead>Partitions</TableHead>
          <TableHead>Replication</TableHead>
          <TableHead>Messages</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {topics.map((topic) => (
          <Fragment key={topic.name}>
            <TableRow className="kafka-admin-row" onClick={() => toggle(topic.name)} aria-expanded={expanded === topic.name}>
              <TableCell className="kafka-admin-name">
                {topic.name} {topic.internal && <Badge variant="secondary">internal</Badge>}
              </TableCell>
              <TableCell>{topic.partitions.length}</TableCell>
              <TableCell>{topic.replicationFactor}</TableCell>
              <TableCell>≈ {topic.messageCount.toLocaleString('en-US')}</TableCell>
              <TableCell onClick={(event) => event.stopPropagation()}>
                <div className="kafka-actions">
                  <Button variant="secondary" size="sm" onClick={() => onAddToListener(topic.name)} aria-label={`Add ${topic.name} to listener`}>
                    Add to listener
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onConsume(topic.name)} aria-label={`Consume ${topic.name}`}>
                    Consume
                  </Button>
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Delete ${topic.name}`}>
                        <Icon icon={Delete02Icon} />
                      </Button>
                    }
                    title={`Delete topic ${topic.name}?`}
                    description="All messages in the topic are permanently deleted. This cannot be undone."
                    confirmLabel="Delete topic"
                    onConfirm={() => onDelete(topic.name)}
                  />
                </div>
              </TableCell>
            </TableRow>
            {expanded === topic.name && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT}>
                  <TopicDetail topic={topic} configs={configs[topic.name]} />
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
