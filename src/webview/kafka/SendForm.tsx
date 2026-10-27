import { SentIcon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { parseHeadersJson } from '../../core/kafka/connection';
import { EMPTY_SEND_DRAFT, SendDraft } from '../../core/kafka/sendJob';
import { applyTemplate } from '../../core/kafka/sendTemplates';
import { isJsonText, prettifyResponseBody } from '../../core/responsePretty';
import { KafkaJobProgress, KafkaSendTemplate } from '../../shared/kafkaProduceTypes';
import { KafkaProduceResult } from '../../shared/types';
import { Icon } from '../Icon';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { FormField } from './FormField';
import { HeadersEditor } from './HeadersEditor';
import { JobProgressPanel } from './JobProgressPanel';
import { SendOptionsFields } from './SendOptionsFields';
import { TemplatePicker } from './TemplatePicker';

export type { SendDraft } from '../../core/kafka/sendJob';
export { EMPTY_SEND_DRAFT } from '../../core/kafka/sendJob';

interface Props {
  draft: SendDraft;
  result?: KafkaProduceResult;
  pending: boolean;
  job?: KafkaJobProgress;
  templates?: KafkaSendTemplate[];
  readOnlyReason?: string;
  onChange: (draft: SendDraft) => void;
  onSend: (draft: SendDraft, headers: Record<string, string>) => void;
  onStop?: (jobId: string) => void;
  onSaveTemplate?: (name: string) => void;
  onDeleteTemplate?: (templateId: string) => void;
}

function sendLabel(draft: SendDraft, running: boolean, pending: boolean): string {
  if (running || pending) {
    return 'Sending…';
  }
  if (draft.repeat) {
    return 'Start repeating';
  }
  const count = Number(draft.count);
  return count > 1 ? `Send ${count} messages` : 'Send message';
}

export function SendForm({ draft, result, pending, job, templates = [], readOnlyReason, onChange, onSend, onStop, onSaveTemplate, onDeleteTemplate }: Props) {
  const [headersError, setHeadersError] = useState<string>();
  const patch = (changes: Partial<SendDraft>) => onChange({ ...draft, ...changes });
  const running = job?.state === 'running';

  const submit = () => {
    const { headers, error } = parseHeadersJson(draft.headers);
    setHeadersError(error);
    !error && onSend(draft, headers);
  };

  return (
    <form className="kafka-send" onSubmit={(event) => event.preventDefault()}>
      {readOnlyReason && <p className="kafka-error-box">{readOnlyReason}</p>}
      <TemplatePicker
        templates={templates}
        onLoad={(template) => onChange(applyTemplate(draft, template))}
        onSave={(name) => onSaveTemplate?.(name)}
        onDelete={(templateId) => onDeleteTemplate?.(templateId)}
      />
      <FormField label="Topic">{(id) => <Input id={id} value={draft.topic} onChange={(event) => patch({ topic: event.target.value })} />}</FormField>
      <FormField label="Key (optional)">{(id) => <Input id={id} value={draft.key} onChange={(event) => patch({ key: event.target.value })} />}</FormField>
      <FormField label="Headers (optional)">{() => <HeadersEditor text={draft.headers} onChange={(headers) => patch({ headers })} />}</FormField>
      <ValueEditor draft={draft} onPatch={patch} />
      <SendOptionsFields draft={draft} onPatch={patch} />
      {headersError && <p className="kafka-error">{headersError}</p>}
      {result && <SendResult result={result} />}
      {job && onStop && <JobProgressPanel progress={job} onStop={onStop} />}
      <div className="kafka-actions">
        <Button disabled={pending || running || Boolean(readOnlyReason)} onClick={submit}>
          <Icon icon={SentIcon} /> {sendLabel(draft, running, pending)}
        </Button>
        <Button variant="ghost" onClick={() => onChange(EMPTY_SEND_DRAFT)}>
          Clear
        </Button>
      </div>
    </form>
  );
}

function ValueEditor({ draft, onPatch }: { draft: SendDraft; onPatch: (changes: Partial<SendDraft>) => void }) {
  const isJson = isJsonText(draft.value);
  return (
    <FormField label="Message value">
      {(id) => (
        <>
          <Textarea id={id} rows={10} disabled={draft.tombstone} value={draft.tombstone ? '' : draft.value} onChange={(event) => onPatch({ value: event.target.value })} />
          <div className="kafka-actions">
            <Button variant="secondary" size="sm" disabled={!isJson || draft.tombstone} onClick={() => onPatch({ value: prettifyResponseBody(draft.value) })}>
              Prettify JSON
            </Button>
            <span className="kafka-hint">
              {draft.tombstone ? 'Tombstone: a null value is sent' : isJson ? 'Valid JSON' : 'Plain text'} — variables like {'{{$uuid}}'}, {'{{$timestamp}}'}, {'{{$randomInt}}'},{' '}
              {'{{$index}}'} and collection variables resolve per message
            </span>
          </div>
        </>
      )}
    </FormField>
  );
}

function SendResult({ result }: { result: KafkaProduceResult }) {
  return result.ok ? (
    <p className="kafka-success">
      Sent to {result.topic} (partition {result.partition}, offset {result.offset})
    </p>
  ) : (
    <p className="kafka-error">{result.error}</p>
  );
}
