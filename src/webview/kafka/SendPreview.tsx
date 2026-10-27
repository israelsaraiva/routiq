import { RefreshIcon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { parseHeadersJson } from '../../core/kafka/connection';
import { SendDraft } from '../../core/kafka/sendJob';
import { MessageTemplate, resolveMessageTemplate, usesPerMessageVariables } from '../../core/kafka/sendTemplate';
import { isJsonText, prettifyResponseBody } from '../../core/responsePretty';
import { IconButton } from '../components/IconButton';

const PREVIEW_SEQUENCE = 1;

function templateOf(draft: SendDraft): MessageTemplate {
  return { key: draft.key || null, value: draft.tombstone ? '' : draft.value, headers: parseHeadersJson(draft.headers).headers };
}

function formatValue(value: string): string {
  return isJsonText(value) ? prettifyResponseBody(value) : value;
}

export function SendPreview({ draft }: { draft: SendDraft }) {
  const [generation, setGeneration] = useState(0);
  const template = useMemo(() => templateOf(draft), [draft.key, draft.value, draft.headers, draft.tombstone]);
  const resolved = useMemo(() => resolveMessageTemplate(template, {}, PREVIEW_SEQUENCE), [template, generation]);

  if (draft.tombstone || !usesPerMessageVariables(template)) {
    return null;
  }

  return (
    <section className="kafka-send-preview" aria-label="Payload preview">
      <div className="kafka-value-header">
        <h4 className="kafka-section-title">Preview of message {PREVIEW_SEQUENCE} after variable expansion</h4>
        <IconButton icon={RefreshIcon} label="Regenerate preview" compact onClick={() => setGeneration(generation + 1)} />
      </div>
      {resolved.key !== null && <pre className="kafka-pre">{`key: ${resolved.key}`}</pre>}
      {Object.keys(resolved.headers).length > 0 && <pre className="kafka-pre">{JSON.stringify(resolved.headers, null, 2)}</pre>}
      <pre className="kafka-pre" data-testid="kafka-send-preview-value">{formatValue(resolved.value)}</pre>
      <span className="kafka-hint">Collection variables are resolved when sending.</span>
    </section>
  );
}
