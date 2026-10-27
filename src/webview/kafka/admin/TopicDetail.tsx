import { isUnderReplicated, offsetDistance } from '../../../core/kafka/admin';
import { TopicConfigChanges } from '../../../core/kafka/topicConfigEdit';
import { KafkaTopicConfigEntry, KafkaTopicInfo } from '../../../shared/kafkaAdminTypes';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { IncreasePartitions } from './IncreasePartitions';
import { TopicConfigEditor } from './TopicConfigEditor';

interface Props {
  topic: KafkaTopicInfo;
  configs?: KafkaTopicConfigEntry[];
  onAlterConfigs: (changes: TopicConfigChanges, validateOnly: boolean) => void;
  onIncreasePartitions: (totalPartitions: number) => void;
}

export function TopicDetail({ topic, configs, onAlterConfigs, onIncreasePartitions }: Props) {
  return (
    <div className="kafka-admin-detail">
      <h4 className="kafka-section-title">Partitions</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Partition</TableHead>
            <TableHead>Leader</TableHead>
            <TableHead>Replicas</TableHead>
            <TableHead>ISR</TableHead>
            <TableHead>Low</TableHead>
            <TableHead>High</TableHead>
            <TableHead>Messages</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topic.partitions.map((partition) => (
            <TableRow key={partition.partition}>
              <TableCell>{partition.partition}</TableCell>
              <TableCell>{partition.leader}</TableCell>
              <TableCell>{partition.replicas.join(', ')}</TableCell>
              <TableCell>
                {partition.isr.join(', ')} {isUnderReplicated(partition) && <Badge variant="warning">under-replicated</Badge>}
              </TableCell>
              <TableCell>{partition.low}</TableCell>
              <TableCell>{partition.high}</TableCell>
              <TableCell>{offsetDistance(partition.low, partition.high)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <IncreasePartitions topic={topic.name} currentPartitions={topic.partitions.length} onIncrease={onIncreasePartitions} />
      <h4 className="kafka-section-title">Configuration</h4>
      <TopicConfigEditor topic={topic.name} configs={configs} onAlter={onAlterConfigs} />
    </div>
  );
}
