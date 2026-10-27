import { Delete02Icon, Upload01Icon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { groupByFlow } from '../../core/kafka/flowGroups';
import { parseJsonFile } from '../../core/kafka/jsonLogParser';
import { LogFilterType, filterBySearchQuery, filterByType, sortByTimestamp, uniqueContainers, uniqueLevels } from '../../core/kafka/logFilters';
import { convertToKafkaMessages } from '../../core/kafka/splunkMessages';
import { KafkaLogFile } from '../../shared/types';
import { Icon } from '../Icon';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { postKafkaMessage } from '../vscodeApi';
import { FlowGroupList } from './FlowGroupList';
import { copyFlow, copyMessage, copyMessages, downloadFlow } from './flowActions';
import { useMessageSelection } from './useMessageSelection';

const FILTER_TYPE_OPTIONS: Array<{ value: LogFilterType; label: string }> = [
  { value: 'none', label: 'No filter' },
  { value: 'container', label: 'Container' },
  { value: 'level', label: 'Level' },
];

interface Props {
  logFile?: KafkaLogFile;
}

export function LogFilePanel({ logFile }: Props) {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<LogFilterType>('none');
  const [filterValue, setFilterValue] = useState('');
  const [oldestFirst, setOldestFirst] = useState(false);
  const selection = useMessageSelection();

  const parsed = useMemo(() => (logFile ? parseJsonFile(logFile.text) : undefined), [logFile]);
  const messages = useMemo(() => (parsed ? convertToKafkaMessages(parsed.entries) : []), [parsed]);
  const visible = useMemo(
    () => sortByTimestamp(filterBySearchQuery(filterByType(messages, filterType, filterValue), query), oldestFirst),
    [messages, filterType, filterValue, query, oldestFirst],
  );
  const groups = useMemo(() => groupByFlow(visible), [visible]);
  const filterValues = filterType === 'container' ? uniqueContainers(messages) : filterType === 'level' ? uniqueLevels(messages) : [];
  const selectedMessages = visible.filter((message) => selection.selectedIds.has(message.id));

  const clearFilters = () => {
    setQuery('');
    setFilterType('none');
    setFilterValue('');
  };

  return (
    <div className="kafka-messages">
      <div className="kafka-toolbar">
        <Button variant="secondary" size="sm" onClick={() => postKafkaMessage({ type: 'kafkaImportLogFile' })}>
          <Icon icon={Upload01Icon} /> {logFile ? 'Replace file' : 'Import Splunk JSON'}
        </Button>
        {logFile && (
          <Button variant="ghost" size="sm" onClick={() => postKafkaMessage({ type: 'kafkaClearLogFile' })}>
            <Icon icon={Delete02Icon} /> Clear
          </Button>
        )}
      </div>
      {!logFile && <p className="kafka-empty">Import a Splunk JSON export (single JSON, array or NDJSON) to browse it as message flows.</p>}
      {parsed?.error && <p className="kafka-error">{parsed.error}</p>}
      {logFile && (
        <>
          <div className="kafka-toolbar">
            <Input aria-label="Search log entries" placeholder="Search value, container, level…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <OptionSelect value={filterType} options={FILTER_TYPE_OPTIONS} ariaLabel="Filter type" onValueChange={(next) => (setFilterType(next), setFilterValue(''))} />
            {filterType !== 'none' && (
              <OptionSelect
                value={filterValue}
                options={filterValues.map((value) => ({ value, label: value }))}
                ariaLabel="Filter value"
                placeholder="Select…"
                onValueChange={setFilterValue}
              />
            )}
            <LabeledSwitch label="Oldest first" checked={oldestFirst} onCheckedChange={setOldestFirst} />
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
          <div className="kafka-stats">
            <Badge variant="outline">{logFile.name}</Badge>
            <Badge variant="outline">{groups.length} flows</Badge>
            <Badge variant="outline">{visible.length} messages</Badge>
            {selectedMessages.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => copyMessages(selectedMessages)}>
                Copy selected ({selectedMessages.length})
              </Button>
            )}
          </div>
          <div className="kafka-scroll">
            <FlowGroupList
              groups={groups}
              selectedIds={selection.selectedIds}
              onToggleSelected={selection.toggle}
              onCopy={copyMessage}
              onCopyFlow={copyFlow}
              onDownloadFlow={downloadFlow}
            />
          </div>
        </>
      )}
    </div>
  );
}
