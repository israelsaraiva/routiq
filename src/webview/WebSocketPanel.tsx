import { SentIcon } from '@hugeicons/core-free-icons';
import { ReactNode, useMemo, useRef, useState } from 'react';
import { BinaryView, displayedPayload, filterWebSocketLog, formatByteSize, formatLogTime, isValidJson } from '../core/streamLog';
import { StreamStatus, WebSocketLogEntry } from '../shared/types';
import { Icon } from './Icon';
import { OptionSelect, SelectOption } from './components/OptionSelect';
import { Button } from './components/ui/button';
import { Label } from './components/ui/label';
import { CodeEditor, EditorToolbar } from './CodeEditor';
import { JsonFormatButtons, JsonFormatStatus, useJsonFormatting } from './JsonEditing';
import { LogToolbar } from './LogToolbar';
import { postToHost } from './vscodeApi';
import { useAutoScroll } from './useAutoScroll';

interface Props {
  status: StreamStatus;
  entries: WebSocketLogEntry[];
  onClear: () => void;
  composerActions?: ReactNode;
  hideComposer?: boolean;
}

type ComposerMode = 'text' | 'json';

const COMPOSER_MODES: Array<SelectOption<ComposerMode>> = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
];

const BINARY_VIEWS: Array<SelectOption<BinaryView>> = [
  { value: 'hex', label: 'Hex' },
  { value: 'base64', label: 'Base64' },
];

const DIRECTION_SYMBOLS = { sent: '↑', received: '↓' } as const;

export function WebSocketPanel({ status, entries, onClear, composerActions, hideComposer }: Props) {
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [mode, setMode] = useState<ComposerMode>('text');
  const [draft, setDraft] = useState('');
  const [binaryView, setBinaryView] = useState<BinaryView>('hex');
  const listRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => filterWebSocketLog(entries, filter), [entries, filter]);
  useAutoScroll(listRef, autoScroll, visible.length);

  const json = useJsonFormatting({ text: draft, onChange: setDraft });
  const invalidJson = mode === 'json' && draft.trim() !== '' && !isValidJson(draft);
  const canSend = status === 'open' && draft !== '' && !invalidJson;
  const send = () => postToHost({ type: 'wsSend', text: mode === 'json' ? JSON.stringify(JSON.parse(draft)) : draft });

  return (
    <>
      {!hideComposer && (
      <div className="composer">
        <CodeEditor
          compact
          toolbar={
            <EditorToolbar
              leading={<OptionSelect value={mode} options={COMPOSER_MODES} onValueChange={setMode} ariaLabel="Message format" />}
              actions={mode === 'json' && <JsonFormatButtons onPrettify={json.prettifyText} onMinify={json.minifyText} disabled={draft.trim() === ''} />}
              status={
                <>
                  {mode === 'json' && <JsonFormatStatus text={draft} formatError={json.formatError} />}
                  <Button className="composer-send" onClick={send} disabled={!canSend}>
                    <Icon icon={SentIcon} />
                    Send message
                  </Button>
                  {composerActions}
                </>
              }
            />
          }
          text={draft}
          placeholder={mode === 'json' ? '{"hello": "world"}' : 'Message to send'}
          onChange={json.handleChange}
          onKeyDown={mode === 'json' ? json.handleKeyDown : undefined}
        />
      </div>
      )}
      <LogToolbar
        filter={filter}
        onFilterChange={setFilter}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        onClear={onClear}
        visibleCount={visible.length}
        totalCount={entries.length}
      />
      <div className="response-toolbar">
        <div className="inline-check">
          <Label>Binary frames</Label>
          <OptionSelect value={binaryView} options={BINARY_VIEWS} onValueChange={setBinaryView} ariaLabel="Binary frames" />
        </div>
      </div>
      <div className="stream-log" ref={listRef}>
        {visible.length === 0 && <div className="placeholder">No messages yet.</div>}
        {visible.map((entry) => (
          <div className={`stream-entry stream-${entry.direction}`} key={entry.sequence}>
            <div className="stream-entry-meta">
              <span className="stream-direction">{DIRECTION_SYMBOLS[entry.direction]}</span>
              <span className="stream-time">{formatLogTime(entry.timestamp)}</span>
              <span className="stream-detail">{formatByteSize(entry.sizeBytes)}</span>
              {entry.binary && <span className="stream-detail">binary</span>}
            </div>
            <pre className="stream-data">{displayedPayload(entry, binaryView)}</pre>
          </div>
        ))}
      </div>
    </>
  );
}
