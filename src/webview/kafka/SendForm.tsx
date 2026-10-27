import { SentIcon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { parseHeadersJson } from '../../core/kafka/connection';
import { KafkaProduceResult } from '../../shared/types';
import { Icon } from '../Icon';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { FormField } from './FormField';

export interface SendDraft {
  topic: string;
  key: string;
  headers: string;
  value: string;
}

export const EMPTY_SEND_DRAFT: SendDraft = { topic: '', key: '', headers: '', value: '' };

interface Props {
  draft: SendDraft;
  result?: KafkaProduceResult;
  pending: boolean;
  onChange: (draft: SendDraft) => void;
  onSend: (draft: SendDraft, headers: Record<string, string>) => void;
}

export function SendForm({ draft, result, pending, onChange, onSend }: Props) {
  const [headersError, setHeadersError] = useState<string>();
  const patch = (changes: Partial<SendDraft>) => onChange({ ...draft, ...changes });

  const submit = () => {
    const { headers, error } = parseHeadersJson(draft.headers);
    setHeadersError(error);
    !error && onSend(draft, headers);
  };

  return (
    <form className="kafka-send" onSubmit={(event) => event.preventDefault()}>
      <FormField label="Topic">{(id) => <Input id={id} value={draft.topic} onChange={(event) => patch({ topic: event.target.value })} />}</FormField>
      <FormField label="Key (optional)">{(id) => <Input id={id} value={draft.key} onChange={(event) => patch({ key: event.target.value })} />}</FormField>
      <FormField label="Headers (JSON object, optional)">
        {(id) => <Textarea id={id} rows={3} value={draft.headers} onChange={(event) => patch({ headers: event.target.value })} />}
      </FormField>
      <FormField label="Message value">
        {(id) => <Textarea id={id} rows={10} value={draft.value} onChange={(event) => patch({ value: event.target.value })} />}
      </FormField>
      {headersError && <p className="kafka-error">{headersError}</p>}
      {result && <SendResult result={result} />}
      <div className="kafka-actions">
        <Button disabled={pending} onClick={submit}>
          <Icon icon={SentIcon} /> {pending ? 'Sending…' : 'Send message'}
        </Button>
        <Button variant="ghost" onClick={() => onChange(EMPTY_SEND_DRAFT)}>
          Clear
        </Button>
      </div>
    </form>
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
