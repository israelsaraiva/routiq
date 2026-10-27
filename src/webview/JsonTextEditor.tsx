import { ReactNode } from 'react';
import { CodeEditor, EditorToolbar } from './CodeEditor';
import { JsonFormatButtons, JsonFormatStatus, useJsonFormatting } from './JsonEditing';

interface Props {
  text: string;
  onChange: (text: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  compact?: boolean;
  title?: string;
  leading?: ReactNode;
}

export function JsonTextEditor({ text, onChange, ariaLabel, placeholder, compact, title, leading }: Props) {
  const { formatError, prettifyText, minifyText, handleKeyDown, handleChange } = useJsonFormatting({ text, onChange });
  const toolbarLeading = leading ?? (title && <span className="section-title">{title}</span>);
  return (
    <CodeEditor
      toolbar={
        <EditorToolbar
          leading={toolbarLeading}
          actions={<JsonFormatButtons onPrettify={prettifyText} onMinify={minifyText} />}
          status={<JsonFormatStatus text={text} formatError={formatError} />}
          copyText={text}
        />
      }
      text={text}
      onChange={handleChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      compact={compact}
      onKeyDown={handleKeyDown}
    />
  );
}
