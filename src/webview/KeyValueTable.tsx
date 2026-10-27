import { Add01Icon, Delete02Icon, LockIcon } from '@hugeicons/core-free-icons';
import { KeyValue } from '../shared/types';
import { AutocompleteInput } from './AutocompleteInput';
import { Icon } from './Icon';
import { IconButton } from './components/IconButton';
import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
import { Input } from './components/ui/input';
import { Table, TableBody, TableCell, TableRow } from './components/ui/table';

interface Props {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  suggestHeaderNames?: boolean;
  allowSecrets?: boolean;
}

const EMPTY_ROW: KeyValue = { key: '', value: '', enabled: true };

export function KeyValueTable({ rows, onChange, keyPlaceholder = 'Key', suggestHeaderNames, allowSecrets }: Props) {
  const updateRow = (index: number, patch: Partial<KeyValue>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const addRow = () => onChange([...rows, { ...EMPTY_ROW }]);

  return (
    <div className="kv-table">
      <Table className="kv-grid">
        <TableBody>
          {rows.map((row, index) => (
            <TableRow className="kv-row" key={index}>
              <TableCell className="kv-cell-check">
                <Checkbox
                  checked={row.enabled}
                  aria-label="Enabled"
                  onCheckedChange={(checked) => updateRow(index, { enabled: checked === true })}
                />
              </TableCell>
              <TableCell>
                {suggestHeaderNames ? (
                  <AutocompleteInput
                    mode="headerNames"
                    value={row.key}
                    placeholder={keyPlaceholder}
                    usedHeaderNames={rows.filter((_, i) => i !== index).map((other) => other.key)}
                    onChange={(key) => updateRow(index, { key })}
                  />
                ) : (
                  <Input value={row.key} placeholder={keyPlaceholder} onChange={(event) => updateRow(index, { key: event.target.value })} />
                )}
              </TableCell>
              <TableCell className="kv-cell-value">
                {row.secret ? (
                  <Input
                    type="password"
                    autoComplete="off"
                    value={row.value}
                    placeholder="Secret value"
                    onChange={(event) => updateRow(index, { value: event.target.value })}
                  />
                ) : (
                  <AutocompleteInput value={row.value} placeholder="Value" onChange={(value) => updateRow(index, { value })} />
                )}
              </TableCell>
              {allowSecrets && (
                <TableCell className="kv-cell-action">
                  <IconButton
                    className={row.secret ? 'toggled' : undefined}
                    icon={LockIcon}
                    label="Toggle secret"
                    tooltip={row.secret ? 'Secret (stored in VS Code SecretStorage) — click to make plain' : 'Mark as secret'}
                    aria-pressed={row.secret === true}
                    onClick={() => updateRow(index, { secret: !row.secret })}
                  />
                </TableCell>
              )}
              <TableCell className="kv-cell-action">
                <IconButton icon={Delete02Icon} label="Remove" onClick={() => removeRow(index)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button variant="secondary" onClick={addRow}>
        <Icon icon={Add01Icon} />
        Add
      </Button>
    </div>
  );
}
