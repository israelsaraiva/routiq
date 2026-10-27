import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Clock01Icon,
  Copy01Icon,
  Download01Icon,
  FilterIcon,
  HardDriveIcon,
  Rocket01Icon,
  Search01Icon,
  TextWrapIcon,
} from '@hugeicons/core-free-icons';
import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { describeTiming } from '../core/network';
import { extensionForContentType, findContentType, languageForBody } from '../core/responseBody';
import { findMatches, splitTokensByMatches, wrapIndex } from '../core/textSearch';
import { tokenize } from '../core/syntaxTokens';
import { ResponseModel } from '../shared/types';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { IconButton } from './components/IconButton';
import { Input } from './components/ui/input';
import { Skeleton } from './components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableRow } from './components/ui/table';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { Icon } from './Icon';
import { ScriptResults, describeScriptsTab } from './ScriptResults';
import { formatBodyView, formatDuration, formatSize, statusClassName } from './format';
import { postToHost } from './vscodeApi';

interface Props {
  response: ResponseModel | undefined;
  sending: boolean;
}

type ResponseTab = 'body' | 'headers' | 'tests';

export function ResponseViewer({ response, sending }: Props) {
  if (sending) {
    return <ResponseSkeleton />;
  }
  if (!response) {
    return <EmptyResponse />;
  }
  if (response.error) {
    return <ErrorCard message={response.error} />;
  }
  return <ResponseContent response={response} />;
}

function ResponseContent({ response }: { response: ResponseModel }) {
  const [tab, setTab] = useState<ResponseTab>('body');
  const [pretty, setPretty] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [filter, setFilter] = useState('');
  const contentType = findContentType(response.headers);
  const view = useMemo(() => formatBodyView(response.body, pretty, filter), [response.body, pretty, filter]);
  const activeTab: ResponseTab = tab === 'tests' && !response.scripts ? 'body' : tab;

  return (
    <div className="response">
      <div className="response-header">
        <Badge variant="status" className={statusClassName(response.status)}>
          <span className="status-dot" aria-hidden="true" />
          {response.status} {response.statusText}
        </Badge>
        <Badge variant="outline" title={describeTiming(response.timeMs, response.timing)}>
          <Icon icon={Clock01Icon} size={12} />
          {formatDuration(response.timeMs)}
        </Badge>
        <Badge variant="outline" title="Size">
          <Icon icon={HardDriveIcon} size={12} />
          {formatSize(response.sizeBytes)}
        </Badge>
        <div className="response-actions">
          <IconButton icon={Copy01Icon} label="Copy body" onClick={() => void navigator.clipboard.writeText(view.text)} />
          <IconButton
            icon={Download01Icon}
            label="Save body to file"
            onClick={() => postToHost({ type: 'saveResponseBody', body: view.text, extension: extensionForContentType(contentType) })}
          />
          <IconButton
            className={wrap ? 'toggled' : undefined}
            icon={TextWrapIcon}
            label="Toggle line wrap"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          />
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={(next) => setTab(next as ResponseTab)}>
        <TabsList>
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="headers">Headers ({response.headers.length})</TabsTrigger>
          {response.scripts && <TabsTrigger value="tests">{describeScriptsTab(response.scripts)}</TabsTrigger>}
        </TabsList>
      </Tabs>
      {activeTab === 'tests' && response.scripts ? <ScriptResults scripts={response.scripts} /> : null}
      {activeTab === 'body' ? (
        <BodyPanel
          response={response}
          view={view}
          pretty={pretty}
          onPrettyChange={setPretty}
          wrap={wrap}
          filter={filter}
          onFilterChange={setFilter}
        />
      ) : null}
      {activeTab === 'headers' ? <HeadersTable headers={response.headers} /> : null}
    </div>
  );
}

function EmptyResponse() {
  return (
    <Card className="empty-state">
      <span className="empty-state-icon">
        <Icon icon={Rocket01Icon} size={28} />
      </span>
      <strong>No response yet</strong>
      <span>Enter a URL and press Send, or hit Enter in the URL field.</span>
    </Card>
  );
}

function ResponseSkeleton() {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label="Sending request">
      <Skeleton className="skeleton-short" />
      <Skeleton />
      <Skeleton />
      <Skeleton className="skeleton-medium" />
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <Icon icon={Alert02Icon} size={20} />
      <div className="ui-alert-body">
        <AlertTitle>Request failed</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </div>
    </Alert>
  );
}

type Segment = ReturnType<typeof splitTokensByMatches>[number];

interface BodyPanelProps {
  response: ResponseModel;
  view: ReturnType<typeof formatBodyView>;
  pretty: boolean;
  onPrettyChange: (pretty: boolean) => void;
  wrap: boolean;
  filter: string;
  onFilterChange: (filter: string) => void;
}

function BodyPanel({ response, view, pretty, onPrettyChange, wrap, filter, onFilterChange }: BodyPanelProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const contentType = findContentType(response.headers);
  const language = useMemo(() => languageForBody(contentType, response.body), [contentType, response.body]);
  const matches = useMemo(() => findMatches(view.text, query), [view.text, query]);
  const lines = useMemo(
    () => splitSegmentsIntoLines(splitTokensByMatches(tokenize(view.text, view.error ? 'plain' : language), matches)),
    [view.text, view.error, language, matches],
  );
  const activeMatch = wrapIndex(currentMatch, matches.length);
  const activeRef = useRef<HTMLElement | null>(null);
  const filterVisible = filterOpen || filter !== '';

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center' });
  }, [activeMatch, matches]);

  const stepMatch = (delta: number) => setCurrentMatch(wrapIndex(activeMatch + delta, matches.length));

  return (
    <div className="response-body-panel">
      <div className="response-toolbar">
        <SegmentedControl
          label="Body format"
          value={pretty ? 'pretty' : 'raw'}
          onValueChange={(next) => onPrettyChange(next === 'pretty')}
          options={[
            { value: 'pretty', label: 'Pretty' },
            { value: 'raw', label: 'Raw' },
          ]}
        />
        <Button
          variant="ghost"
          className={filterVisible ? 'filter-toggle toggled' : 'filter-toggle'}
          aria-pressed={filterVisible}
          aria-expanded={filterVisible}
          onClick={() => setFilterOpen(!filterVisible)}
        >
          <Icon icon={FilterIcon} size={14} />
          Filter
        </Button>
        <div className="search-group">
          <Icon icon={Search01Icon} size={14} />
          <input
            className="search-input"
            placeholder="Search"
            aria-label="Find in response"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentMatch(0);
            }}
            onKeyDown={(event) => event.key === 'Enter' && stepMatch(event.shiftKey ? -1 : 1)}
          />
          <span className="match-count">{query ? `${matches.length === 0 ? 0 : activeMatch + 1}/${matches.length}` : ''}</span>
          <IconButton icon={ArrowUp01Icon} label="Previous match" iconSize={14} onClick={() => stepMatch(-1)} />
          <IconButton icon={ArrowDown01Icon} label="Next match" iconSize={14} onClick={() => stepMatch(1)} />
        </div>
      </div>
      {filterVisible && (
        <Input
          className="filter-input"
          placeholder="JSON path, e.g. $.data[0].name"
          aria-label="JSON path filter"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
        />
      )}
      {view.error && <div className="filter-error">{view.error}</div>}
      <div className="code-card">
        <IconButton
          className="code-copy"
          icon={Copy01Icon}
          label="Copy visible body"
          iconSize={14}
          onClick={() => void navigator.clipboard.writeText(view.text)}
        />
        <div className="code-scroll">
          <pre
            className={wrap ? 'response-body wrap' : 'response-body'}
            style={{ '--gutter-digits': String(lines.length).length } as CSSProperties}
          >
            {lines.map((line, index) => (
              <div className="code-line" key={index}>
                {line.map((segment, segmentIndex) => (
                  <SegmentView key={segmentIndex} segment={segment} activeMatch={activeMatch} activeRef={activeRef} />
                ))}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

function splitSegmentsIntoLines(segments: Segment[]): Segment[][] {
  const lines: Segment[][] = [[]];
  for (const segment of segments) {
    segment.text.split('\n').forEach((part, partIndex) => {
      if (partIndex > 0) {
        lines.push([]);
      }
      if (part !== '') {
        lines[lines.length - 1].push({ ...segment, text: part });
      }
    });
  }
  const endsWithNewline = lines.length > 1 && lines[lines.length - 1].length === 0;
  return endsWithNewline ? lines.slice(0, -1) : lines;
}

interface SegmentedControlProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
}

function SegmentedControl({ label, value, options, onValueChange }: SegmentedControlProps) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="segmented-item"
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SegmentViewProps {
  segment: Segment;
  activeMatch: number;
  activeRef: React.MutableRefObject<HTMLElement | null>;
}

function SegmentView({ segment, activeMatch, activeRef }: SegmentViewProps) {
  if (segment.matchIndex === undefined) {
    return <span className={`tok-${segment.kind}`}>{segment.text}</span>;
  }
  const active = segment.matchIndex === activeMatch;
  return (
    <mark
      className={`tok-${segment.kind} ${active ? 'match-active' : 'match'}`}
      ref={active ? (element) => void (activeRef.current = element) : undefined}
    >
      {segment.text}
    </mark>
  );
}

function HeadersTable({ headers }: { headers: ResponseModel['headers'] }) {
  return (
    <Table className="headers-table">
      <TableBody>
        {headers.map(([name, value], index) => (
          <TableRow key={index}>
            <TableHead>{name}</TableHead>
            <TableCell>
              <div className="header-cell">
              <span className="header-value">{value}</span>
              <IconButton
                className="header-copy"
                icon={Copy01Icon}
                label={`Copy ${name} value`}
                iconSize={14}
                onClick={() => void navigator.clipboard.writeText(value)}
              />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
