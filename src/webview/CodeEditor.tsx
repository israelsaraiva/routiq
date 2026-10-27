import { Copy01Icon } from '@hugeicons/core-free-icons';
import { KeyboardEvent, ReactNode, UIEvent, useRef } from 'react';
import { AutocompleteInput } from './AutocompleteInput';
import { IconButton } from './components/IconButton';
import { Separator } from './components/ui/separator';

interface EditorToolbarProps {
  leading?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  copyText?: string;
}

export function EditorToolbar({ leading, actions, status, copyText }: EditorToolbarProps) {
  const copyToClipboard = () => void navigator.clipboard?.writeText(copyText ?? '').catch(() => undefined);
  return (
    <div className="editor-toolbar">
      {leading}
      {leading && actions && <Separator orientation="vertical" className="editor-toolbar-separator" />}
      {actions}
      <span className="editor-toolbar-spacer" />
      {status}
      {copyText !== undefined && <IconButton icon={Copy01Icon} label="Copy" compact disabled={copyText === ''} onClick={copyToClipboard} />}
    </div>
  );
}

interface CodeEditorProps {
  toolbar: ReactNode;
  text: string;
  onChange: (text: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

function lineNumbers(text: string): string {
  const lineCount = text.split('\n').length;
  return Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
}

export function CodeEditor({ toolbar, text, onChange, placeholder, ariaLabel, compact, onKeyDown }: CodeEditorProps) {
  const gutterRef = useRef<HTMLPreElement>(null);

  const syncGutterScroll = (event: UIEvent<HTMLElement>) => {
    if (gutterRef.current && event.target instanceof HTMLTextAreaElement) {
      gutterRef.current.scrollTop = event.target.scrollTop;
    }
  };

  return (
    <div className={compact ? 'code-editor code-editor-compact' : 'code-editor'}>
      {toolbar}
      <div className="code-editor-body" onScrollCapture={syncGutterScroll}>
        <pre className="code-editor-gutter" aria-hidden="true" ref={gutterRef}>
          {lineNumbers(text)}
        </pre>
        <AutocompleteInput
          multiline
          className="code-editor-input"
          spellCheck={false}
          ariaLabel={ariaLabel}
          placeholder={placeholder}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
