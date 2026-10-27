import { ReactNode } from 'react';
import { FormattableBodyType, prettifyBody } from '../core/bodyFormat';
import { Badge } from './components/ui/badge';
import { Tooltip } from './components/ui/tooltip';
import { CodeEditor, EditorToolbar } from './CodeEditor';
import { JsonFormatButtons, JsonFormatStatus, useJsonFormatting } from './JsonEditing';

interface Props {
  type: FormattableBodyType;
  text: string;
  onChange: (text: string) => void;
  leading?: ReactNode;
}

function FormatErrorBadge({ message }: { message: string }) {
  return (
    <Tooltip content={message}>
      <Badge variant="outline" className="editor-status editor-status-invalid">
        <span className="editor-status-dot" aria-hidden="true" />
        Format failed
      </Badge>
    </Tooltip>
  );
}

export function BodyTextEditor({ type, text, onChange, leading }: Props) {
  const { formatError, prettifyText, minifyText, handleKeyDown, handleChange } = useJsonFormatting({
    text,
    onChange,
    prettify: (value) => prettifyBody(type, value),
  });

  const status = type === 'json' ? <JsonFormatStatus text={text} formatError={formatError} /> : formatError && <FormatErrorBadge message={formatError} />;

  return (
    <CodeEditor
      toolbar={
        <EditorToolbar
          leading={leading}
          actions={<JsonFormatButtons onPrettify={prettifyText} onMinify={type === 'json' ? minifyText : undefined} />}
          status={status}
          copyText={text}
        />
      }
      text={text}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
}
