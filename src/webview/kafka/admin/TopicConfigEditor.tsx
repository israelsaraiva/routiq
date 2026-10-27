import { useEffect, useMemo, useState } from 'react';
import { TopicConfigChanges, describeConfigChanges, diffConfigChanges, isEditableConfig } from '../../../core/kafka/topicConfigEdit';
import { KafkaTopicConfigEntry } from '../../../shared/kafkaAdminTypes';
import { ConfirmAction } from '../../components/ConfirmAction';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';

interface Props {
  topic: string;
  configs?: KafkaTopicConfigEntry[];
  onAlter: (changes: TopicConfigChanges, validateOnly: boolean) => void;
}

type Edits = Record<string, string | null>;

function sourceBadge(entry: KafkaTopicConfigEntry) {
  if (entry.sensitive) {
    return <Badge variant="warning">sensitive</Badge>;
  }
  if (entry.readOnly) {
    return <Badge variant="secondary">read-only</Badge>;
  }
  return <Badge variant={entry.isDefault ? 'secondary' : 'info'}>{entry.isDefault ? 'default' : 'overridden'}</Badge>;
}

function sortedConfigs(configs: KafkaTopicConfigEntry[]): KafkaTopicConfigEntry[] {
  return [...configs].sort((left, right) => Number(left.isDefault) - Number(right.isDefault) || left.name.localeCompare(right.name));
}

export function TopicConfigEditor({ topic, configs, onAlter }: Props) {
  const [edits, setEdits] = useState<Edits>({});
  const changes = useMemo(() => diffConfigChanges(configs ?? [], edits), [configs, edits]);
  const hasChanges = Object.keys(changes).length > 0;

  useEffect(() => setEdits({}), [configs]);

  if (!configs) {
    return <div className="kafka-empty">Loading configuration…</div>;
  }

  const setEdit = (name: string, value: string | null) => setEdits({ ...edits, [name]: value });
  const shownValue = (entry: KafkaTopicConfigEntry) => (entry.name in edits ? edits[entry.name] : entry.value);

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Config</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Source</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedConfigs(configs).map((entry) => (
            <TableRow key={entry.name}>
              <TableCell className="kafka-admin-name">{entry.name}</TableCell>
              <TableCell className="kafka-admin-name">
                {isEditableConfig(entry) ? (
                  <Input aria-label={`Value of ${entry.name}`} value={shownValue(entry) ?? ''} disabled={edits[entry.name] === null} onChange={(event) => setEdit(entry.name, event.target.value)} />
                ) : (
                  (entry.value ?? '—')
                )}
              </TableCell>
              <TableCell>{sourceBadge(entry)}</TableCell>
              <TableCell>
                {isEditableConfig(entry) && !entry.isDefault && (
                  <Button variant="ghost" size="sm" aria-label={`Reset ${entry.name} to default`} onClick={() => setEdit(entry.name, edits[entry.name] === null ? entry.value : null)}>
                    {edits[entry.name] === null ? 'Undo reset' : 'Reset'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="kafka-actions">
        <Button variant="secondary" size="sm" disabled={!hasChanges} onClick={() => onAlter(changes, true)}>
          Validate
        </Button>
        <ConfirmAction
          trigger={
            <Button size="sm" disabled={!hasChanges}>
              Apply changes
            </Button>
          }
          title={`Change configuration of ${topic}?`}
          description={describeConfigChanges(changes)}
          confirmLabel="Apply"
          onConfirm={() => onAlter(changes, false)}
        />
      </div>
    </div>
  );
}
