import { KeyboardEvent, RefObject, UIEvent, useMemo, useRef, useState } from 'react';
import { applySuggestion, GraphqlSuggestions, suggestGraphql } from '../core/graphql/completion';
import { tokenizeGraphql } from '../core/graphql/tokens';
import { wrapIndex } from '../core/textSearch';
import { GraphqlSchemaSummary } from '../shared/types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  schema?: GraphqlSchemaSummary;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

const NO_SUGGESTIONS: GraphqlSuggestions = { replaceFrom: 0, items: [] };

function HighlightedQuery({ value }: { value: string }) {
  const tokens = useMemo(() => tokenizeGraphql(value), [value]);
  return (
    <>
      {tokens.map((token) => (
        <span key={token.start} className={`gql-${token.kind}`}>
          {token.text}
        </span>
      ))}
      {'\n'}
    </>
  );
}

export function GraphqlQueryEditor({ value, onChange, schema, textareaRef }: Props) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const pendingCaret = useRef<number>();
  const [suggestions, setSuggestions] = useState(NO_SUGGESTIONS);
  const [activeIndex, setActiveIndex] = useState(0);

  const refreshSuggestions = (text: string, caret: number) => {
    setSuggestions(schema ? suggestGraphql(text, caret, schema) : NO_SUGGESTIONS);
    setActiveIndex(0);
  };

  const accept = (label: string) => {
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const edit = applySuggestion(value, caret, suggestions, label);
    pendingCaret.current = edit.caret;
    onChange(edit.text);
    setSuggestions(NO_SUGGESTIONS);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(edit.caret, edit.caret));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const { items } = suggestions;
    if (event.key === ' ' && event.ctrlKey) {
      event.preventDefault();
      refreshSuggestions(value, event.currentTarget.selectionStart);
    } else if (items.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setActiveIndex((index) => wrapIndex(index + (event.key === 'ArrowDown' ? 1 : -1), items.length));
    } else if (items.length > 0 && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault();
      accept(items[activeIndex].label);
    } else if (event.key === 'Escape') {
      setSuggestions(NO_SUGGESTIONS);
    }
  };

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = event.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  };

  return (
    <div className="gql-editor">
      <pre ref={highlightRef} className="gql-highlight" aria-hidden="true">
        <HighlightedQuery value={value} />
      </pre>
      <textarea
        ref={textareaRef}
        className="gql-input"
        aria-label="GraphQL query"
        spellCheck={false}
        wrap="off"
        placeholder="query { … }"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          refreshSuggestions(event.target.value, event.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        onBlur={() => setSuggestions(NO_SUGGESTIONS)}
      />
      {suggestions.items.length > 0 && (
        <ul className="ui-command-list gql-suggestions" role="listbox">
          {suggestions.items.map((item, index) => (
            <li
              key={item.label}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'ui-command-item active' : 'ui-command-item'}
              onMouseDown={(event) => {
                event.preventDefault();
                accept(item.label);
              }}
            >
              <span>{item.label}</span>
              {item.detail && <span className="ui-command-detail">{item.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
