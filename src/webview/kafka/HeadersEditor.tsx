import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import { parseHeadersJson } from '../../core/kafka/connection';
import { HeaderRow, headersTextFromRows, rowsFromText } from '../../core/kafka/headersTable';
import { prettifyResponseBody } from '../../core/responsePretty';
import { Icon } from '../Icon';
import { IconButton } from '../components/IconButton';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';

type EditorMode = 'table' | 'json';

interface Props {
  text: string;
  onChange: (text: string) => void;
}

export function HeadersEditor({ text, onChange }: Props) {
  const [mode, setMode] = useState<EditorMode>('table');
  const [rows, setRows] = useState<HeaderRow[]>(() => rowsFromText(text));

  useEffect(() => {
    headersTextFromRows(rows) !== headersTextFromRows(rowsFromText(text)) && setRows(rowsFromText(text));
  }, [text]);

  const updateRows = (next: HeaderRow[]) => {
    setRows(next);
    onChange(headersTextFromRows(next));
  };
  const changeRow = (index: number, changes: Partial<HeaderRow>) => updateRows(rows.map((row, position) => (position === index ? { ...row, ...changes } : row)));

  return (
    <div className="kafka-headers">
      <div className="kafka-actions">
        <Button variant={mode === 'table' ? 'default' : 'secondary'} size="sm" onClick={() => setMode('table')}>
          Table
        </Button>
        <Button variant={mode === 'json' ? 'default' : 'secondary'} size="sm" onClick={() => setMode('json')}>
          JSON
        </Button>
      </div>
      {mode === 'table' ? (
        <>
          {rows.map((row, index) => (
            <div className="kafka-header-row" key={index}>
              <Input aria-label={`Header name ${index + 1}`} placeholder="name" value={row.name} onChange={(event) => changeRow(index, { name: event.target.value })} />
              <Input aria-label={`Header value ${index + 1}`} placeholder="value" value={row.value} onChange={(event) => changeRow(index, { value: event.target.value })} />
              <IconButton icon={Delete02Icon} label={`Remove header ${index + 1}`} compact onClick={() => updateRows(rows.filter((_, position) => position !== index))} />
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setRows([...rows, { name: '', value: '' }])}>
            <Icon icon={Add01Icon} /> Add header
          </Button>
        </>
      ) : (
        <JsonHeaders text={text} onChange={onChange} />
      )}
    </div>
  );
}

function JsonHeaders({ text, onChange }: Props) {
  const { error } = parseHeadersJson(text);
  return (
    <>
      <Textarea aria-label="Headers JSON" rows={4} value={text} onChange={(event) => onChange(event.target.value)} />
      {error && <p className="kafka-error">{error}</p>}
      <Button variant="secondary" size="sm" disabled={Boolean(error) || !text.trim()} onClick={() => onChange(prettifyResponseBody(text))}>
        Prettify
      </Button>
    </>
  );
}
