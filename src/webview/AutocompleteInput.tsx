import { ClipboardEvent, createContext, KeyboardEvent, useContext, useLayoutEffect, useRef, useState } from 'react';
import { VariableSuggestion } from '../shared/types';
import { filterHeaderNames, filterVariableSuggestions, findPlaceholderTrigger, insertVariable } from '../core/autocomplete';
import { wrapIndex } from '../core/textSearch';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';

export const VariableSuggestionsContext = createContext<VariableSuggestion[]>([]);

type SuggestionMode = 'variables' | 'headerNames';

interface Option {
  label: string;
  detail?: string;
  apply: (text: string, caret: number) => { text: string; caret: number };
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  mode?: SuggestionMode;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  spellCheck?: boolean;
  usedHeaderNames?: string[];
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  onPasteText?: (text: string) => boolean;
}

const FALLBACK_LINE_HEIGHT_PX = 18;

function variableOptions(suggestions: VariableSuggestion[], text: string, caret: number): Option[] {
  const trigger = findPlaceholderTrigger(text, caret);
  if (!trigger) {
    return [];
  }
  return filterVariableSuggestions(suggestions, trigger.query).map((suggestion) => ({
    label: suggestion.name,
    detail: suggestion.source,
    apply: (current, position) => insertVariable(current, position, trigger, suggestion.name),
  }));
}

function headerNameOptions(text: string, usedNames: string[]): Option[] {
  if (text.trim() === '') {
    return [];
  }
  return filterHeaderNames(text, usedNames).map((name) => ({ label: name, apply: () => ({ text: name, caret: name.length }) }));
}

function lineOffsetPx(element: HTMLTextAreaElement | HTMLInputElement, caret: number): number {
  if (element instanceof HTMLInputElement) {
    return element.offsetHeight;
  }
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || FALLBACK_LINE_HEIGHT_PX;
  const line = element.value.slice(0, caret).split('\n').length;
  return Math.min(line * lineHeight - element.scrollTop, element.offsetHeight);
}

export function AutocompleteInput({
  value, onChange, mode = 'variables', multiline, className, placeholder, ariaLabel, spellCheck, usedHeaderNames = [], onKeyDown, onPasteText,
}: Props) {
  const suggestions = useContext(VariableSuggestionsContext);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number>();
  const [options, setOptions] = useState<Option[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [offsetTop, setOffsetTop] = useState(0);

  useLayoutEffect(() => {
    if (pendingCaret.current !== undefined && fieldRef.current) {
      fieldRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = undefined;
    }
  });

  const refreshOptions = (text: string, caret: number) => {
    const next = mode === 'headerNames' ? headerNameOptions(text, usedHeaderNames) : variableOptions(suggestions, text, caret);
    setOptions(next);
    setActiveIndex(0);
    if (fieldRef.current) {
      setOffsetTop(lineOffsetPx(fieldRef.current, caret));
    }
  };

  const accept = (option: Option) => {
    const field = fieldRef.current;
    const caret = field?.selectionStart ?? value.length;
    const edit = option.apply(value, caret);
    pendingCaret.current = edit.caret;
    onChange(edit.text);
    setOptions([]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (options.length > 0 && handleNavigationKey(event)) {
      event.preventDefault();
      return;
    }
    onKeyDown?.(event);
  };

  const handleNavigationKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setActiveIndex((index) => wrapIndex(index + (event.key === 'ArrowDown' ? 1 : -1), options.length));
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      accept(options[activeIndex]);
      return true;
    }
    if (event.key === 'Escape') {
      setOptions([]);
      return true;
    }
    return false;
  };

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (onPasteText?.(event.clipboardData.getData('text'))) {
      event.preventDefault();
      setOptions([]);
    }
  };

  const sharedProps = {
    ref: fieldRef,
    className,
    placeholder,
    spellCheck,
    'aria-label': ariaLabel,
    value,
    onChange: (event: { target: { value: string; selectionStart: number | null } }) => {
      onChange(event.target.value);
      refreshOptions(event.target.value, event.target.selectionStart ?? event.target.value.length);
    },
    onKeyDown: handleKeyDown,
    onPaste: handlePaste,
    onBlur: () => setOptions([]),
  };

  return (
    <div className={multiline ? 'autocomplete autocomplete-block' : 'autocomplete'}>
      {multiline ? <Textarea {...sharedProps} /> : <Input {...sharedProps} />}
      {options.length > 0 && (
        <ul className="ui-command-list" role="listbox" style={{ top: offsetTop }}>
          {options.map((option, index) => (
            <li
              key={option.label}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'ui-command-item active' : 'ui-command-item'}
              onMouseDown={(event) => {
                event.preventDefault();
                accept(option);
              }}
            >
              <span>{option.label}</span>
              {option.detail && <span className="ui-command-detail">{option.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
