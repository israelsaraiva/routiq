import { Add01Icon, Delete02Icon, ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { KeyValue } from '../shared/types';
import { AutocompleteInput } from './AutocompleteInput';
import { Icon } from './Icon';
import { IconButton } from './components/IconButton';
import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
import { Input } from './components/ui/input';
import { Switch } from './components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';

interface Props {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
}

const NEW_ROW: KeyValue = { key: '', value: '', enabled: true };

export function EnvironmentVariablesTable({ rows, onChange }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [rowToFocus, setRowToFocus] = useState<number>();
  const [revealedRows, setRevealedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (rowToFocus === undefined) {
      return;
    }
    tableRef.current?.querySelector<HTMLInputElement>(`[data-row="${rowToFocus}"] [data-field="key"]`)?.focus();
    setRowToFocus(undefined);
  }, [rowToFocus, rows.length]);

  const updateRow = (index: number, patch: Partial<KeyValue>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeRow = (index: number) => {
    setRevealedRows(new Set());
    onChange(rows.filter((_, i) => i !== index));
  };
  const addRow = () => {
    onChange([...rows, { ...NEW_ROW }]);
    setRowToFocus(rows.length);
  };
  const toggleReveal = (index: number) =>
    setRevealedRows((current) => {
      const next = new Set(current);
      if (!next.delete(index)) {
        next.add(index);
      }
      return next;
    });
  const addRowOnEnter = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addRow();
    }
  };

  if (rows.length === 0) {
    return (
      <div className="env-empty">
        <p className="env-empty-title">No variables yet</p>
        <p className="env-empty-hint">Variables defined here can be referenced as {'{{name}}'} in requests.</p>
        <Button variant="secondary" onClick={addRow}>
          <Icon icon={Add01Icon} />
          Add variable
        </Button>
      </div>
    );
  }

  return (
    <div className="env-variables" ref={tableRef}>
      <div className="env-table-card">
        <Table className="env-table">
          <TableHeader>
            <TableRow>
              <TableHead className="env-col-check"><span className="sr-only">Enabled</span></TableHead>
              <TableHead className="env-col-key">Key</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="env-col-secret">Secret</TableHead>
              <TableHead className="env-col-action"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const revealed = revealedRows.has(index);
              return (
                <TableRow className="env-row" key={index} data-row={index}>
                  <TableCell className="env-col-check">
                    <Checkbox
                      checked={row.enabled}
                      aria-label="Enabled"
                      onCheckedChange={(checked) => updateRow(index, { enabled: checked === true })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      data-field="key"
                      value={row.key}
                      placeholder="Variable"
                      aria-label="Variable name"
                      onChange={(event) => updateRow(index, { key: event.target.value })}
                      onKeyDown={addRowOnEnter}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="env-value-cell">
                      {row.secret ? (
                        <>
                          <Input
                            type={revealed ? 'text' : 'password'}
                            autoComplete="off"
                            value={row.value}
                            placeholder="Secret value"
                            aria-label="Secret value"
                            onChange={(event) => updateRow(index, { value: event.target.value })}
                            onKeyDown={addRowOnEnter}
                          />
                          <IconButton
                            icon={revealed ? ViewOffIcon : ViewIcon}
                            label={revealed ? 'Hide value' : 'Show value'}
                            onClick={() => toggleReveal(index)}
                          />
                        </>
                      ) : (
                        <AutocompleteInput
                          value={row.value}
                          placeholder="Value"
                          ariaLabel="Value"
                          onChange={(value) => updateRow(index, { value })}
                          onKeyDown={addRowOnEnter}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="env-col-secret">
                    <Switch
                      checked={row.secret === true}
                      aria-label="Toggle secret"
                      title={row.secret ? 'Secret (stored in VS Code SecretStorage)' : 'Mark as secret'}
                      onCheckedChange={(secret) => updateRow(index, { secret })}
                    />
                  </TableCell>
                  <TableCell className="env-col-action">
                    <IconButton icon={Delete02Icon} label="Remove" onClick={() => removeRow(index)} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Button variant="secondary" onClick={addRow}>
        <Icon icon={Add01Icon} />
        Add variable
      </Button>
    </div>
  );
}
