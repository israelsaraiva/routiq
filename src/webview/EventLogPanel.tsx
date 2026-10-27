import { useMemo, useRef, useState } from 'react';
import { filterSseLog, formatLogTime } from '../core/streamLog';
import { SseLogEntry } from '../shared/types';
import { LogToolbar } from './LogToolbar';
import { useAutoScroll } from './useAutoScroll';

interface Props {
  entries: SseLogEntry[];
  onClear: () => void;
}

export function EventLogPanel({ entries, onClear }: Props) {
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => filterSseLog(entries, filter), [entries, filter]);
  useAutoScroll(listRef, autoScroll, visible.length);

  return (
    <>
      <LogToolbar
        filter={filter}
        onFilterChange={setFilter}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        onClear={onClear}
        visibleCount={visible.length}
        totalCount={entries.length}
      />
      <div className="stream-log" ref={listRef}>
        {visible.length === 0 && <div className="placeholder">No events yet.</div>}
        {visible.map(({ sequence, timestamp, event }) => (
          <div className="stream-entry" key={sequence}>
            <div className="stream-entry-meta">
              <span className="stream-time">{formatLogTime(timestamp)}</span>
              <span className="stream-event-name">{event.event}</span>
              {event.id !== undefined && <span className="stream-detail">id: {event.id}</span>}
              {event.retry !== undefined && <span className="stream-detail">retry: {event.retry}</span>}
            </div>
            {event.data !== '' && <pre className="stream-data">{event.data}</pre>}
          </div>
        ))}
      </div>
    </>
  );
}
