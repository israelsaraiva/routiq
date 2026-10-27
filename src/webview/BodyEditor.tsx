import { useEffect } from 'react';
import { Add01Icon, Delete02Icon, File01Icon } from '@hugeicons/core-free-icons';
import { BodyType, FilePickTarget, HostToWebviewMessage, MultipartField, RequestBody } from '../shared/types';
import { AutocompleteInput } from './AutocompleteInput';
import { JsonTextEditor } from './JsonTextEditor';
import { CodeEditor, EditorToolbar } from './CodeEditor';
import { Icon } from './Icon';
import { IconButton } from './components/IconButton';
import { OptionSelect, SelectOption } from './components/OptionSelect';
import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
import { Table, TableBody, TableCell, TableRow } from './components/ui/table';
import { BodyTextEditor } from './BodyTextEditor';
import { KeyValueTable } from './KeyValueTable';
import { postToHost } from './vscodeApi';

interface Props {
  body: RequestBody;
  onChange: (body: RequestBody) => void;
}

const BODY_TYPES: Array<SelectOption<BodyType>> = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'text', label: 'Text' },
  { value: 'form', label: 'Form URL-encoded' },
  { value: 'multipart', label: 'Multipart Form' },
  { value: 'binary', label: 'Binary File' },
  { value: 'graphql', label: 'GraphQL' },
];

const FIELD_KINDS: Array<SelectOption<MultipartField['kind']>> = [
  { value: 'text', label: 'Text' },
  { value: 'file', label: 'File' },
];

const EMPTY_FIELD: MultipartField = { key: '', kind: 'text', value: '', enabled: true };

function applyPickedFile(body: RequestBody, target: FilePickTarget, path: string): RequestBody {
  if (target.kind === 'binary') {
    return { ...body, filePath: path };
  }
  const multipart = (body.multipart ?? []).map((field, index) => (index === target.index ? { ...field, value: path } : field));
  return { ...body, multipart };
}

function MultipartEditor({ fields, onChange }: { fields: MultipartField[]; onChange: (fields: MultipartField[]) => void }) {
  const updateField = (index: number, patch: Partial<MultipartField>) =>
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const removeField = (index: number) => onChange(fields.filter((_, i) => i !== index));
  const pickFile = (index: number) => postToHost({ type: 'pickFile', target: { kind: 'multipart', index } });

  return (
    <div className="kv-table">
      <Table className="kv-grid">
        <TableBody>
          {fields.map((field, index) => (
            <TableRow className="kv-row" key={index}>
              <TableCell className="kv-cell-check">
                <Checkbox
                  checked={field.enabled}
                  aria-label="Enabled"
                  onCheckedChange={(checked) => updateField(index, { enabled: checked === true })}
                />
              </TableCell>
              <TableCell>
                <AutocompleteInput value={field.key} placeholder="Name" onChange={(key) => updateField(index, { key })} />
              </TableCell>
              <TableCell>
                <OptionSelect
                  value={field.kind}
                  options={FIELD_KINDS}
                  ariaLabel="Field type"
                  onValueChange={(kind) => updateField(index, { kind, value: '' })}
                />
              </TableCell>
              <TableCell className="kv-cell-value">
                <AutocompleteInput
                  value={field.value}
                  placeholder={field.kind === 'file' ? 'File path' : 'Value'}
                  onChange={(value) => updateField(index, { value })}
                />
              </TableCell>
              <TableCell className="kv-cell-action">
                {field.kind === 'file' && <IconButton icon={File01Icon} label="Choose file" onClick={() => pickFile(index)} />}
              </TableCell>
              <TableCell className="kv-cell-action">
                <IconButton icon={Delete02Icon} label="Remove" onClick={() => removeField(index)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button variant="secondary" onClick={() => onChange([...fields, { ...EMPTY_FIELD }])}>
        <Icon icon={Add01Icon} />
        Add
      </Button>
    </div>
  );
}

function BinaryEditor({ filePath, onChange }: { filePath: string; onChange: (filePath: string) => void }) {
  return (
    <div className="binary-row">
      <AutocompleteInput value={filePath} placeholder="File path" onChange={onChange} />
      <Button variant="secondary" onClick={() => postToHost({ type: 'pickFile', target: { kind: 'binary' } })}>
        <Icon icon={File01Icon} />
        Choose file
      </Button>
    </div>
  );
}

function GraphqlEditor({ body, patchBody }: { body: RequestBody; patchBody: (patch: Partial<RequestBody>) => void }) {
  return (
    <>
      <CodeEditor
        toolbar={<EditorToolbar leading={<span className="section-title">Query</span>} copyText={body.text} />}
        text={body.text}
        placeholder="query { … }"
        onChange={(text) => patchBody({ text })}
      />
      <JsonTextEditor
        title="Variables"
        compact
        placeholder='Variables (JSON), e.g. {"id": 1}'
        text={body.graphqlVariables ?? ''}
        onChange={(graphqlVariables) => patchBody({ graphqlVariables })}
      />
    </>
  );
}

export function BodyEditor({ body, onChange }: Props) {
  const patchBody = (patch: Partial<RequestBody>) => onChange({ ...body, ...patch });

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      if (event.data.type === 'filePicked') {
        onChange(applyPickedFile(body, event.data.target, event.data.path));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [body, onChange]);

  const isTextBody = body.type === 'json' || body.type === 'text' || body.type === 'xml';
  const bodyTypeSelect = (
    <OptionSelect value={body.type} options={BODY_TYPES} ariaLabel="Body type" onValueChange={(type) => patchBody({ type })} />
  );

  return (
    <div className="body-panel">
      {!isTextBody && <div className="editor-toolbar editor-toolbar-lone">{bodyTypeSelect}</div>}
      {(body.type === 'json' || body.type === 'text' || body.type === 'xml') && (
        <BodyTextEditor type={body.type} text={body.text} onChange={(text) => patchBody({ text })} leading={bodyTypeSelect} />
      )}
      {body.type === 'form' && <KeyValueTable rows={body.form} onChange={(form) => patchBody({ form })} />}
      {body.type === 'multipart' && <MultipartEditor fields={body.multipart ?? []} onChange={(multipart) => patchBody({ multipart })} />}
      {body.type === 'binary' && <BinaryEditor filePath={body.filePath ?? ''} onChange={(filePath) => patchBody({ filePath })} />}
      {body.type === 'graphql' && <GraphqlEditor body={body} patchBody={patchBody} />}
    </div>
  );
}
