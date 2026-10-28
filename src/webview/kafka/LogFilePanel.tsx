import { Delete02Icon, Upload01Icon } from '@hugeicons/core-free-icons';
import { useMemo, useRef, useState } from 'react';
import { groupByFlow } from '../../core/kafka/flowGroups';
import { importLogFile } from '../../core/kafka/logImport';
import { LogFilterType, filterBySearchQuery, filterByType, sortByTimestamp, uniqueContainers, uniqueLevels } from '../../core/kafka/logFilters';
import { KafkaLogFile, KafkaMessage } from '../../shared/types';
import { Icon } from '../Icon';
import { LabeledSwitch } from '../components/LabeledSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { postKafkaMessage } from '../vscodeApi';
import { FlowGroupList, useCollapsedFlows } from './FlowGroupList';
import { copyFlow, copyMessage, copyMessages, downloadFlow } from './flowActions';
import { buildSaveItems } from '../../core/kafka/messageToRequest';
import { MessageDetailPanel } from './MessageDetailPanel';
import { MessageDisplayContext, useMessageDisplay } from './MessageDisplayContext';
import { MessageNavContext, useMessageNavState } from './MessageNav';
import { PanelSide, ResizeHandle } from './ResizeHandle';
import { useElementWidth } from './useElementWidth';
import { useMessageSelection } from './useMessageSelection';
import { useMessageShortcuts } from './useMessageShortcuts';
import { useStoredNumber } from './useStoredNumber';

const FILTER_TYPE_OPTIONS: Array<{ value: LogFilterType; label: string }> = [
  { value: 'none', label: 'No filter' },
  { value: 'container', label: 'Container' },
  { value: 'level', label: 'Level' },
];

const WIDE_LAYOUT_MIN_WIDTH = 760;
const DETAIL_MIN_SIZE = 240;
const DETAIL_DEFAULT_WIDTH = 400;
const DETAIL_DEFAULT_HEIGHT = 260;
const LIST_MIN_SIZE = 280;
const DETAIL_WIDTH_KEY = 'routiq.kafka.detailWidth';
const DETAIL_HEIGHT_KEY = 'routiq.kafka.detailHeight';
const MAX_VERTICAL_SHARE = 0.7;

interface Props {
  logFile?: KafkaLogFile;
  active?: boolean;
}

export function LogFilePanel({ logFile, active = true }: Props) {
  const display = useMessageDisplay();
  const saveAsRequest = (messages: KafkaMessage[]) => postKafkaMessage({ type: 'kafkaSaveAsRequest', items: buildSaveItems(messages) });
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<LogFilterType>('none');
  const [filterValue, setFilterValue] = useState('');
  const [oldestFirst, setOldestFirst] = useState(false);
  const selection = useMessageSelection();
  const collapsedFlows = useCollapsedFlows();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const bodyWidth = useElementWidth(body);
  const [detailWidth, setDetailWidth] = useStoredNumber(DETAIL_WIDTH_KEY, DETAIL_DEFAULT_WIDTH);
  const [detailHeight, setDetailHeight] = useStoredNumber(DETAIL_HEIGHT_KEY, DETAIL_DEFAULT_HEIGHT);
  const side: PanelSide = bodyWidth >= WIDE_LAYOUT_MIN_WIDTH ? 'right' : 'bottom';

  const imported = useMemo(() => (logFile ? importLogFile(logFile) : undefined), [logFile]);
  const messages = useMemo(() => imported?.messages ?? [], [imported]);
  const visible = useMemo(
    () => sortByTimestamp(filterBySearchQuery(filterByType(messages, filterType, filterValue), query), oldestFirst),
    [messages, filterType, filterValue, query, oldestFirst],
  );
  const groups = useMemo(() => groupByFlow(visible), [visible]);
  const filterValues = filterType === 'container' ? uniqueContainers(messages) : filterType === 'level' ? uniqueLevels(messages) : [];
  const selectedMessages = visible.filter((message) => selection.selectedIds.has(message.id));
  const orderedIds = useMemo(() => groups.flatMap((group) => group.messages.map((message) => message.id)), [groups]);
  const nav = useMessageNavState(orderedIds);
  const openMessage = visible.find((message) => message.id === nav.openId);
  const allSelected = visible.length > 0 && selectedMessages.length === visible.length;

  useMessageShortcuts({
    active,
    onFocusFilter: () => root.current?.querySelector<HTMLInputElement>('input[aria-label="Search log entries"]')?.focus(),
    onTogglePause: () => undefined,
    onMove: nav.move,
    onClose: nav.close,
  });

  const clearFilters = () => {
    setQuery('');
    setFilterType('none');
    setFilterValue('');
  };

  const selectAllVisible = () => selection.toggle(orderedIds, true);
  const collapseAllFlows = () => collapsedFlows.collapseAll(groups.map((group) => group.flowId));

  return (
    <MessageNavContext.Provider value={nav}>
    <div ref={root} className="kafka-messages">
      <div className="kafka-toolbar">
        <Button variant="secondary" size="sm" onClick={() => postKafkaMessage({ type: 'kafkaImportLogFile' })}>
          <Icon icon={Upload01Icon} /> {logFile ? 'Replace file' : 'Import log / CSV'}
        </Button>
        {logFile && (
          <Button variant="ghost" size="sm" onClick={() => postKafkaMessage({ type: 'kafkaClearLogFile' })}>
            <Icon icon={Delete02Icon} /> Clear
          </Button>
        )}
      </div>
      {!logFile && <p className="kafka-empty">Import a Splunk JSON export (single JSON, array or NDJSON) or a Routiq CSV/JSON/NDJSON export to browse it as message flows.</p>}
      {imported?.error && <p className="kafka-error">{imported.error}</p>}
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
            <Button variant="ghost" size="sm" disabled={groups.length === 0} onClick={collapseAllFlows}>
              Collapse all
            </Button>
            <Button variant="ghost" size="sm" disabled={groups.length === 0} onClick={collapsedFlows.expandAll}>
              Expand all
            </Button>
            <Button variant="ghost" size="sm" disabled={visible.length === 0 || allSelected} onClick={selectAllVisible}>
              Select all
            </Button>
            {selectedMessages.length > 0 && (
              <>
                <Badge variant="secondary">{selectedMessages.length} selected</Badge>
                <Button variant="ghost" size="sm" onClick={selection.clear}>
                  Clear selection
                </Button>
                <Button variant="secondary" size="sm" onClick={() => copyMessages(selectedMessages)}>
                  Copy selected ({selectedMessages.length})
                </Button>
              </>
            )}
          </div>
          <div ref={body} className="kafka-body" data-side={side}>
          <div className="kafka-scroll">
            <FlowGroupList
              groups={groups}
              collapsedFlows={collapsedFlows}
              selectedIds={selection.selectedIds}
              onToggleSelected={selection.toggle}
              onCopy={copyMessage}
              onCopyFlow={copyFlow}
              onDownloadFlow={downloadFlow}
            />
          </div>
          {openMessage && (
            <>
              <ResizeHandle
                side={side}
                size={side === 'right' ? detailWidth : detailHeight}
                min={DETAIL_MIN_SIZE}
                max={side === 'right' ? bodyWidth - LIST_MIN_SIZE : Math.round(window.innerHeight * MAX_VERTICAL_SHARE)}
                label="Resize message detail"
                onResize={side === 'right' ? setDetailWidth : setDetailHeight}
              />
              <div className="kafka-detail-slot" style={side === 'right' ? { width: detailWidth } : { height: detailHeight }}>
                <MessageDisplayContext.Provider value={{ ...display, onSaveAsRequest: saveAsRequest }}>
                  <MessageDetailPanel message={openMessage} onClose={nav.close} onCopy={copyMessage} />
                </MessageDisplayContext.Provider>
              </div>
            </>
          )}
          </div>
        </>
      )}
    </div>
    </MessageNavContext.Provider>
  );
}
