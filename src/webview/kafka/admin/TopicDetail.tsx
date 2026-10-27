import { isUnderReplicated, offsetDistance } from '../../../core/kafka/admin';
import { KafkaTopicConfigEntry, KafkaTopicInfo } from '../../../shared/kafkaAdminTypes';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';

interface Props {
  topic: KafkaTopicInfo;
  configs?: KafkaTopicConfigEntry[];
}

function ConfigTable({ configs }: { configs?: KafkaTopicConfigEntry[] }) {
  if (!configs) {
    return <div className="kafka-empty">Loading configuration…</div>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Config</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...configs]
          .sort((left, right) => Number(left.isDefault) - Number(right.isDefault) || left.name.localeCompare(right.name))
          .map((entry) => (
            <TableRow key={entry.name}>
              <TableCell className="kafka-admin-name">{entry.name}</TableCell>
              <TableCell className="kafka-admin-name">{entry.value ?? '—'}</TableCell>
              <TableCell>
                <Badge variant={entry.isDefault ? 'secondary' : 'info'}>{entry.isDefault ? 'default' : 'overridden'}</Badge>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}

export function TopicDetail({ topic, configs }: Props) {
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
      <h4 className="kafka-section-title">Configuration (read-only)</h4>
      <ConfigTable configs={configs} />
    </div>
  );
}
