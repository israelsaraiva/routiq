import { ArrowDown01Icon, ArrowRight01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { operationKeywordFor, searchSchema } from '../core/graphql/schemaSearch';
import { GraphqlFieldSummary, GraphqlTypeSummary } from '../shared/types';
import { Icon } from './Icon';
import { Alert } from './components/ui/alert';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { GraphqlSchemaState } from './useGraphqlSchema';

interface Props {
  state: GraphqlSchemaState;
  onFetch: () => void;
  onInsertField: (fieldName: string, operationKeyword: string) => void;
}

function formatFetchedAt(timestamp: number | undefined, cached: boolean): string {
  if (timestamp === undefined) {
    return '';
  }
  return `${cached ? 'Cached' : 'Fetched'} ${new Date(timestamp).toLocaleString()}`;
}

function FieldRow({ field, onInsert }: { field: GraphqlFieldSummary; onInsert: () => void }) {
  const args = field.args.map((argument) => `${argument.name}: ${argument.type}`).join(', ');
  return (
    <li className="gql-field">
      <Button variant="ghost" className="gql-field-button" onClick={onInsert} title={field.description ?? `Insert ${field.name}`}>
        <span className={field.deprecated ? 'gql-field-name gql-deprecated' : 'gql-field-name'}>{field.name}</span>
        {args && <span className="gql-field-args">({args})</span>}
        <span className="gql-field-type">: {field.type}</span>
      </Button>
      {field.description && <div className="gql-description">{field.description}</div>}
    </li>
  );
}

function TypeSection({ type, fields, expanded, onToggle, onInsertField, operationKeyword }: {
  type: GraphqlTypeSummary;
  fields: GraphqlFieldSummary[];
  expanded: boolean;
  onToggle: () => void;
  onInsertField: Props['onInsertField'];
  operationKeyword: string;
}) {
  return (
    <section className="gql-type">
      <Button variant="ghost" className="gql-type-header" onClick={onToggle} aria-expanded={expanded}>
        <Icon icon={expanded ? ArrowDown01Icon : ArrowRight01Icon} size={14} />
        <span className="gql-type-name">{type.name}</span>
        <span className="gql-type-kind">{type.kind}</span>
      </Button>
      {expanded && (
        <div className="gql-type-body">
          {type.description && <div className="gql-description">{type.description}</div>}
          {type.members.length > 0 && <div className="gql-members">{type.members.join(' | ')}</div>}
          <ul className="gql-fields">
            {fields.map((field) => (
              <FieldRow key={field.name} field={field} onInsert={() => onInsertField(field.name, operationKeyword)} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function GraphqlSchemaExplorer({ state, onFetch, onInsertField }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const { schema } = state;
  const results = useMemo(() => (schema ? searchSchema(schema, search) : []), [schema, search]);
  const searching = search.trim() !== '';

  const toggleType = (name: string) =>
    setExpandedTypes((current) => {
      const next = new Set(current);
      if (!next.delete(name)) {
        next.add(name);
      }
      return next;
    });

  return (
    <div className="gql-explorer">
      <div className="gql-explorer-bar">
        <Button variant="ghost" className="gql-type-header" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon icon={open ? ArrowDown01Icon : ArrowRight01Icon} size={14} />
          <span className="section-title">Schema</span>
        </Button>
        <span className="stream-detail">{formatFetchedAt(state.fetchedAt, state.cached)}</span>
        <Button variant="secondary" onClick={onFetch} disabled={state.fetching} aria-busy={state.fetching}>
          <Icon icon={RefreshIcon} />
          {state.fetching ? 'Fetching' : 'Fetch schema'}
        </Button>
      </div>
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {open && !schema && !state.error && <div className="stream-detail">No schema yet. Use “Fetch schema” to run an introspection query.</div>}
      {open && schema && (
        <>
          <Input placeholder="Search types, fields and arguments" aria-label="Search schema" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="gql-explorer-list">
            {results.map(({ type, fields }) => (
              <TypeSection
                key={type.name}
                type={type}
                fields={fields}
                expanded={searching || expandedTypes.has(type.name)}
                onToggle={() => toggleType(type.name)}
                onInsertField={onInsertField}
                operationKeyword={operationKeywordFor(schema, type.name)}
              />
            ))}
            {results.length === 0 && <div className="stream-detail">No matches.</div>}
          </div>
        </>
      )}
    </div>
  );
}
