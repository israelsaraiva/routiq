import { useMemo, useState } from 'react';
import {
  LONG_STRING_LENGTH,
  appendPath,
  childEntries,
  collectContainerPaths,
  findAncestorsOfMatches,
  isContainerNode,
  nodeKind,
  splitByTerm,
  summarizeContainer,
} from '../../core/kafka/jsonTree';
import { Button } from '../components/ui/button';

const CHILD_PAGE_SIZE = 100;
const ROOT_PATH = '$';

interface TreeContext {
  term: string;
  isOpen: (path: string) => boolean;
  toggle: (path: string) => void;
  onCopy: (text: string) => void;
}

interface Props {
  value: unknown;
  searchTerm?: string;
  onCopy: (text: string) => void;
}

export function JsonTree({ value, searchTerm = '', onCopy }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([ROOT_PATH]));
  const forcedOpen = useMemo(() => findAncestorsOfMatches(value, searchTerm), [value, searchTerm]);
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      next.delete(path) || next.add(path);
      return next;
    });
  const context: TreeContext = { term: searchTerm, isOpen: (path) => open.has(path) || forcedOpen.has(path), toggle, onCopy };

  return (
    <div className="kafka-tree" data-testid="kafka-json-tree">
      <div className="kafka-tree-toolbar">
        <Button variant="ghost" size="sm" onClick={() => setOpen(new Set(collectContainerPaths(value)))}>
          Expand all
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(new Set())}>
          Collapse all
        </Button>
      </div>
      <TreeNode context={context} path={ROOT_PATH} value={value} />
    </div>
  );
}

interface NodeProps {
  context: TreeContext;
  path: string;
  value: unknown;
  name?: string | number;
}

function TreeNode({ context, path, value, name }: NodeProps) {
  return isContainerNode(value) ? <ContainerNode context={context} path={path} value={value} name={name} /> : <LeafNode context={context} path={path} value={value} name={name} />;
}

function Marked({ text, term }: { text: string; term: string }) {
  return (
    <>
      {splitByTerm(text, term).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="kafka-tree-match">
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}

function NodeName({ context, path, name }: { context: TreeContext; path: string; name?: string | number }) {
  return name === undefined ? null : (
    <>
      <button type="button" className="kafka-tree-key" title={`Copy path ${path}`} onClick={() => context.onCopy(path)}>
        <Marked text={String(name)} term={context.term} />
      </button>
      <span className="kafka-tree-colon">: </span>
    </>
  );
}

function ContainerNode({ context, path, value, name }: NodeProps & { value: Record<string, unknown> | unknown[] }) {
  const [visible, setVisible] = useState(CHILD_PAGE_SIZE);
  const open = context.isOpen(path);
  const entries = open ? childEntries(value) : [];

  return (
    <div className="kafka-tree-node">
      <div className="kafka-tree-row">
        <button type="button" className="kafka-tree-toggle" aria-label={open ? `Collapse ${path}` : `Expand ${path}`} onClick={() => context.toggle(path)}>
          {open ? '▾' : '▸'}
        </button>
        <NodeName context={context} path={path} name={name} />
        <span className="kafka-tree-summary">{summarizeContainer(value)}</span>
      </div>
      {open && (
        <div className="kafka-tree-children">
          {entries.slice(0, visible).map(([key, child]) => (
            <TreeNode key={key} context={context} path={appendPath(path, key)} value={child} name={key} />
          ))}
          {entries.length > visible && (
            <Button variant="ghost" size="sm" onClick={() => setVisible(visible + CHILD_PAGE_SIZE)}>
              Show more ({entries.length - visible} remaining)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function LeafNode({ context, path, value, name }: NodeProps) {
  const [expanded, setExpanded] = useState(false);
  const text = typeof value === 'string' ? value : String(value);
  const isLong = typeof value === 'string' && text.length > LONG_STRING_LENGTH;
  const shown = isLong && !expanded ? `${text.slice(0, LONG_STRING_LENGTH)}…` : text;

  return (
    <div className="kafka-tree-row kafka-tree-leaf">
      <NodeName context={context} path={path} name={name} />
      <button type="button" className={`kafka-tree-value kafka-tree-${nodeKind(value)}`} title="Copy value" onClick={() => context.onCopy(text)}>
        {typeof value === 'string' && '"'}
        <Marked text={shown} term={context.term} />
        {typeof value === 'string' && '"'}
      </button>
      {isLong && (
        <button type="button" className="kafka-tree-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'show less' : `show all (${text.length})`}
        </button>
      )}
    </div>
  );
}
