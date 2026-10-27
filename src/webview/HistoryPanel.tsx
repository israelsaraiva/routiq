import { Clock01Icon, Delete02Icon, UndoIcon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import { formatRelativeTime } from '../core/history';
import { HistoryEntry, HistorySummary, HostToWebviewMessage } from '../shared/types';
import { Icon } from './Icon';
import { ConfirmAction } from './components/ConfirmAction';
import { IconButton } from './components/IconButton';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { ScrollArea } from './components/ui/scroll-area';
import { Table, TableBody, TableCell, TableRow } from './components/ui/table';
import { statusClassName } from './format';
import { HistoryTranscript } from './HistoryTranscript';
import { postToHost } from './vscodeApi';

interface Props {
  visible: boolean;
  onShowEntry: (entry: HistoryEntry) => void;
  onRestoreEntry: (entry: HistoryEntry) => void;
}

function statusLabel(summary: HistorySummary): string {
  if (summary.kind && summary.kind !== 'http' && summary.kind !== 'graphql') {
    return summary.statusText;
  }
  return summary.status === 0 ? 'ERR' : String(summary.status);
}

export function HistoryPanel({ visible, onShowEntry, onRestoreEntry }: Props) {
  const [entries, setEntries] = useState<HistorySummary[]>([]);
  const [selected, setSelected] = useState<HistoryEntry>();

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'historyList') {
        setEntries(message.entries);
        setSelected((current) => (message.entries.some((entry) => entry.id === current?.id) ? current : undefined));
      } else if (message.type === 'historyEntry') {
        setSelected(message.entry);
        if (!message.entry.session) {
          onShowEntry(message.entry);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onShowEntry]);

  if (!visible) {
    return null;
  }
  if (entries.length === 0) {
    return <div className="placeholder">No history yet. Sent requests and stream sessions appear here.</div>;
  }

  return (
    <div className="history">
      <div className="history-actions">
        <Button variant="secondary" disabled={!selected} onClick={() => selected && onRestoreEntry(selected)}>
          <Icon icon={UndoIcon} />
          Restore request
        </Button>
        <ConfirmAction
          trigger={
            <Button variant="secondary">
              <Icon icon={Delete02Icon} />
              Clear all
            </Button>
          }
          title="Clear all history?"
          description="Every stored response and stream session for this request is deleted."
          confirmLabel="Clear all"
          onConfirm={() => postToHost({ type: 'historyClear' })}
        />
        {selected?.bodyTruncated && <span className="history-note">Stored body was truncated.</span>}
      </div>
      <ScrollArea className="history-list">
        <Table>
          <TableBody>
            {entries.map((entry) => (
              <TableRow
                key={entry.id}
                className={entry.id === selected?.id ? 'history-item selected' : 'history-item'}
                onClick={() => postToHost({ type: 'historySelect', entryId: entry.id })}
              >
                <TableCell>
                  <span className="method-pill" data-method={entry.method}>
                    {entry.method}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="status" className={statusClassName(entry.status)}>
                    {statusLabel(entry)}
                  </Badge>
                </TableCell>
                <TableCell className="history-time">
                  <Icon icon={Clock01Icon} size={12} /> {formatRelativeTime(entry.timestamp, Date.now())}
                </TableCell>
                <TableCell>{entry.durationMs} ms</TableCell>
                <TableCell className="kv-cell-action">
                  <IconButton
                    icon={Delete02Icon}
                    iconSize={14}
                    label="Delete entry"
                    onClick={(event) => {
                      event.stopPropagation();
                      postToHost({ type: 'historyDelete', entryId: entry.id });
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
      {selected?.session && <HistoryTranscript session={selected.session} />}
    </div>
  );
}
