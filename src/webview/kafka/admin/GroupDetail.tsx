import { KafkaGroupDetail as GroupDetailData } from '../../../shared/kafkaAdminTypes';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { LagValue } from './LagValue';

interface Props {
  group: GroupDetailData;
}

export function GroupDetail({ group }: Props) {
  return (
    <div className="kafka-admin-detail">
      <h4 className="kafka-section-title">
        Total lag <LagValue lag={group.totalLag} />
      </h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Topic</TableHead>
            <TableHead>Partition</TableHead>
            <TableHead>Committed</TableHead>
            <TableHead>Log end</TableHead>
            <TableHead>Lag</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.offsets.length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>No committed offsets.</TableCell>
            </TableRow>
          )}
          {group.offsets.map((offset) => (
            <TableRow key={`${offset.topic}-${offset.partition}`}>
              <TableCell className="kafka-admin-name">{offset.topic}</TableCell>
              <TableCell>{offset.partition}</TableCell>
              <TableCell>{offset.committed ?? '—'}</TableCell>
              <TableCell>{offset.logEnd}</TableCell>
              <TableCell>
                <LagValue lag={offset.lag} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <h4 className="kafka-section-title">Members ({group.members.length})</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>Assignment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.members.length === 0 && (
            <TableRow>
              <TableCell colSpan={3}>No active members.</TableCell>
            </TableRow>
          )}
          {group.members.map((member) => (
            <TableRow key={member.memberId}>
              <TableCell className="kafka-admin-name" title={member.memberId}>
                {member.clientId}
              </TableCell>
              <TableCell>{member.host}</TableCell>
              <TableCell className="kafka-admin-name">
                {member.assignments.map((assignment) => `${assignment.topic}[${assignment.partitions.join(',')}]`).join(' ')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
