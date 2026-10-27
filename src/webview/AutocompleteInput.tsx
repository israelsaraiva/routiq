import { ChangeEvent, ClipboardEvent, createContext, Fragment, KeyboardEvent, MouseEvent, RefObject, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VariableSuggestion } from '../shared/types';
import { filterHeaderNames, filterVariableSuggestions, findPlaceholderTrigger, insertVariable, minimalReplacement } from '../core/autocomplete';
import { wrapIndex } from '../core/textSearch';
import { describeVariable, indexSuggestions, previewValue, scopeLabel } from '../core/variableHints';
import { hasVariableTokens, splitTokensAt, tokenizeVariables, VariableToken } from '../core/variableTokens';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { CaretAnchor, findHoveredVariable, measureCaretAnchor, syncOverlayScroll, useOverlayMirror } from './variableOverlay';

export const VariableSuggestionsContext = createContext<VariableSuggestion[]>([]);

type SuggestionMode = 'variables' | 'headerNames';
type Field = HTMLInputElement & HTMLTextAreaElement;

interface Option {
  label: string;
  detail?: string;
  preview?: string;
  apply: (text: string, caret: number) => { text: string; caret: number };
}

interface Tooltip {
  text: string;
  left: number;
  top: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  mode?: SuggestionMode;
  multiline?: boolean;
  masked?: boolean;
  literal?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  spellCheck?: boolean;
  usedHeaderNames?: string[];
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  onPasteText?: (text: string) => boolean;
}

const MAX_HIGHLIGHTED_LENGTH = 100_000;
const POPUP_MIN_WIDTH_PX = 260;
const CARET_REFRESH_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

function variableOptions(suggestions: VariableSuggestion[], text: string, caret: number): Option[] {
  const trigger = findPlaceholderTrigger(text, caret);
  if (!trigger) {
    return [];
  }
  return filterVariableSuggestions(suggestions, trigger.query).map((suggestion) => ({
    label: suggestion.name,
    detail: scopeLabel(suggestion),
    preview: previewValue(suggestion),
    apply: (current, position) => insertVariable(current, position, trigger, suggestion.name),
  }));
}

function headerNameOptions(text: string, usedNames: string[]): Option[] {
  if (text.trim() === '') {
    return [];
  }
  return filterHeaderNames(text, usedNames).map((name) => ({ label: name, apply: () => ({ text: name, caret: name.length }) }));
}

function replaceWithUndoSupport(field: Field, before: string, after: string): boolean {
  if (typeof document.execCommand !== 'function') {
    return false;
  }
  const { start, end, insert } = minimalReplacement(before, after);
  if (insert === '') {
    return false;
  }
  field.focus();
  field.setSelectionRange(start, end);
  return document.execCommand('insertText', false, insert);
}

function renderTokens(tokens: VariableToken[]) {
  return tokens.map((token, index) =>
    token.kind === 'text' ? (
      <Fragment key={index}>{token.text}</Fragment>
    ) : (
      <span key={index} className={`variable-token variable-${token.kind}`} data-variable={token.name}>
        {token.text}
      </span>
    ),
  );
}

function HighlightOverlay({ tokens, caret, visible, overlayRef }: { tokens: VariableToken[]; caret?: number; visible: boolean; overlayRef: RefObject<HTMLDivElement> }) {
  const parts = caret === undefined ? undefined : splitTokensAt(tokens, caret);
  return (
    <div ref={overlayRef} className={visible ? 'variable-overlay' : 'variable-overlay variable-overlay-measure'} aria-hidden="true">
      <span className="variable-overlay-text">
        {parts ? (
          <>
            {renderTokens(parts.before)}
            <span data-caret="" />
            {renderTokens(parts.after)}
          </>
        ) : (
          renderTokens(tokens)
        )}
        {'\u200b'}
      </span>
    </div>
  );
}

export function AutocompleteInput({
  value, onChange, mode = 'variables', multiline, masked, literal, className, placeholder, ariaLabel, spellCheck, usedHeaderNames = [], onKeyDown, onPasteText,
}: Props) {
  const suggestions = useContext(VariableSuggestionsContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<Field>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pendingCaret = useRef<number>();
  const [options, setOptions] = useState<Option[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [caret, setCaret] = useState(0);
  const [anchor, setAnchor] = useState<CaretAnchor>({ left: 0, top: 0 });
  const [tooltip, setTooltip] = useState<Tooltip>();

  const byName = useMemo(() => indexSuggestions(suggestions), [suggestions]);
  const tokens = useMemo(() => {
    const highlightable = mode === 'variables' && !masked && !literal && value.length <= MAX_HIGHLIGHTED_LENGTH;
    return highlightable ? tokenizeVariables(value, new Set(byName.keys())) : [];
  }, [mode, masked, value, byName]);
  const highlighted = hasVariableTokens(tokens);
  const popupOpen = options.length > 0;
  const overlayActive = mode === 'variables' && !masked && !literal && (highlighted || popupOpen);

  useOverlayMirror(fieldRef, overlayRef, overlayActive);

  useLayoutEffect(() => {
    if (pendingCaret.current !== undefined && fieldRef.current) {
      fieldRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = undefined;
    }
  });

  useLayoutEffect(() => {
    if (!popupOpen || !wrapperRef.current) {
      return;
    }
    const measured = overlayRef.current && measureCaretAnchor(wrapperRef.current, overlayRef.current);
    const fallback = { left: 0, top: fieldRef.current?.offsetHeight ?? 0 };
    const maxLeft = Math.max(0, wrapperRef.current.clientWidth - POPUP_MIN_WIDTH_PX);
    const next = measured ?? fallback;
    const clamped = { left: Math.min(Math.max(next.left, 0), maxLeft), top: next.top };
    setAnchor((current) => (current.left === clamped.left && current.top === clamped.top ? current : clamped));
  }, [popupOpen, value, caret, options]);

  const closePopup = () => setOptions([]);

  const refreshOptions = (text: string, position: number) => {
    const next = literal ? [] : mode === 'headerNames' ? headerNameOptions(text, usedHeaderNames) : variableOptions(suggestions, text, position);
    setOptions(next);
    setActiveIndex(0);
    setCaret(position);
    setTooltip(undefined);
  };

  const accept = (option: Option) => {
    const field = fieldRef.current;
    const position = field?.selectionStart ?? value.length;
    const edit = option.apply(value, position);
    closePopup();
    if (field && replaceWithUndoSupport(field, value, edit.text)) {
      return;
    }
    pendingCaret.current = edit.caret;
    onChange(edit.text);
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
      closePopup();
      return true;
    }
    return false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (popupOpen && !event.nativeEvent.isComposing && handleNavigationKey(event)) {
      event.preventDefault();
      return;
    }
    onKeyDown?.(event);
  };

  const handleKeyUp = (event: KeyboardEvent<Field>) => {
    syncOverlayScroll(fieldRef.current, overlayRef.current);
    if (CARET_REFRESH_KEYS.includes(event.key)) {
      refreshOptions(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
    }
  };

  const handleClick = (event: MouseEvent<Field>) => {
    refreshOptions(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  };

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (onPasteText?.(event.clipboardData.getData('text'))) {
      event.preventDefault();
      closePopup();
    }
  };

  const handleChange = (event: ChangeEvent<Field>) => {
    onChange(event.target.value);
    refreshOptions(event.target.value, event.target.selectionStart ?? event.target.value.length);
  };

  const handleMouseMove = (event: MouseEvent<HTMLElement>) => {
    if (!highlighted || popupOpen || !overlayRef.current || !wrapperRef.current) {
      return;
    }
    const hovered = findHoveredVariable(overlayRef.current, event.clientX, event.clientY);
    const wrapperBox = wrapperRef.current.getBoundingClientRect();
    setTooltip(
      hovered && {
        text: describeVariable(hovered.dataset.variable ?? '', byName),
        left: event.clientX - wrapperBox.left,
        top: event.clientY - wrapperBox.top + 16,
      },
    );
  };

  const sharedProps = {
    ref: fieldRef,
    className,
    placeholder,
    spellCheck,
    'aria-label': ariaLabel,
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onKeyUp: handleKeyUp,
    onClick: handleClick,
    onScroll: () => syncOverlayScroll(fieldRef.current, overlayRef.current),
    onPaste: handlePaste,
    onBlur: () => {
      closePopup();
      setTooltip(undefined);
    },
  };

  const wrapperClass = ['autocomplete', multiline ? 'autocomplete-block' : '', highlighted ? 'has-variables' : ''].filter(Boolean).join(' ');

  return (
    <div ref={wrapperRef} className={wrapperClass} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(undefined)}>
      {multiline ? <Textarea {...sharedProps} /> : <Input {...sharedProps} type={masked ? 'password' : undefined} autoComplete={masked ? 'off' : undefined} />}
      {overlayActive && <HighlightOverlay tokens={tokens} caret={popupOpen ? caret : undefined} visible={highlighted} overlayRef={overlayRef} />}
      {tooltip && (
        <div className="variable-tooltip" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          {tooltip.text}
        </div>
      )}
      {popupOpen && (
        <ul className="ui-command-list variable-suggestions" role="listbox" style={{ left: anchor.left, top: anchor.top }}>
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
              <span className="variable-option-name">{option.label}</span>
              {option.preview && <span className="ui-command-detail variable-option-preview">{option.preview}</span>}
              {option.detail && <span className="ui-command-detail">{option.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
