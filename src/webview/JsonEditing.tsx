import { KeyboardEvent, useState } from 'react';
import { ArrowShrink02Icon, MagicWand01Icon } from '@hugeicons/core-free-icons';
import { describeJsonError, FormatResult, minifyJson, prettifyJson, validateJson } from '../core/jsonFormat';
import { Icon } from './Icon';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Tooltip } from './components/ui/tooltip';

export const PRETTIFY_SHORTCUT_LABEL = 'Shift+Alt+F';

export function isPrettifyShortcut(event: KeyboardEvent<HTMLElement>): boolean {
  return event.shiftKey && event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyF';
}

interface JsonFormattingOptions {
  text: string;
  onChange: (text: string) => void;
  prettify?: (text: string) => FormatResult;
}

export function useJsonFormatting({ text, onChange, prettify = prettifyJson }: JsonFormattingOptions) {
  const [formatError, setFormatError] = useState<string>();

  const applyFormat = (result: FormatResult) => {
    if (result.ok) {
      setFormatError(undefined);
      onChange(result.text);
      return;
    }
    setFormatError(describeJsonError(result));
  };

  const prettifyText = () => applyFormat(prettify(text));
  const minifyText = () => applyFormat(minifyJson(text));

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (isPrettifyShortcut(event)) {
      event.preventDefault();
      prettifyText();
    }
  };

  const handleChange = (value: string) => {
    setFormatError(undefined);
    onChange(value);
  };

  return { formatError, prettifyText, minifyText, handleKeyDown, handleChange };
}

interface JsonFormatButtonsProps {
  onPrettify: () => void;
  onMinify?: () => void;
  disabled?: boolean;
}

export function JsonFormatButtons({ onPrettify, onMinify, disabled }: JsonFormatButtonsProps) {
  return (
    <>
      <Tooltip content={`Prettify (${PRETTIFY_SHORTCUT_LABEL})`}>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onPrettify}>
          <Icon icon={MagicWand01Icon} />
          Prettify
        </Button>
      </Tooltip>
      {onMinify && (
        <Tooltip content="Minify">
          <Button variant="ghost" size="sm" disabled={disabled} onClick={onMinify}>
            <Icon icon={ArrowShrink02Icon} />
            Minify
          </Button>
        </Tooltip>
      )}
    </>
  );
}

type EditorStatusTone = 'valid' | 'invalid';

function EditorStatusBadge({ tone, label, detail }: { tone: EditorStatusTone; label: string; detail: string }) {
  return (
    <Tooltip content={detail}>
      <Badge variant="outline" className={`editor-status editor-status-${tone}`}>
        <span className="editor-status-dot" aria-hidden="true" />
        {label}
      </Badge>
    </Tooltip>
  );
}

function describeJsonErrorCompact(error: { line: number; column: number }): string {
  return `Invalid JSON \u00b7 line ${error.line}, col ${error.column}`;
}

export function JsonValidityStatus({ text }: { text: string }) {
  if (text.trim() === '') {
    return null;
  }
  const validity = validateJson(text);
  return validity.valid ? (
    <EditorStatusBadge tone="valid" label="Valid JSON" detail="The body is valid JSON" />
  ) : (
    <EditorStatusBadge tone="invalid" label={describeJsonErrorCompact(validity)} detail={describeJsonError(validity)} />
  );
}

export function JsonFormatStatus({ text, formatError }: { text: string; formatError?: string }) {
  if (formatError && validateJson(text).valid) {
    return <EditorStatusBadge tone="invalid" label="Format failed" detail={formatError} />;
  }
  return <JsonValidityStatus text={text} />;
}
