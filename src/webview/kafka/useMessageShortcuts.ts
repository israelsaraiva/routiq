import { useEffect, useRef } from 'react';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ACTIVATING_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);
const OWN_KEY_ROLES = new Set(['textbox', 'combobox', 'listbox', 'option', 'slider', 'tab', 'radio', 'menuitem', 'switch', 'checkbox', 'button', 'separator']);

interface Shortcuts {
  active: boolean;
  onFocusFilter: () => void;
  onTogglePause: () => void;
  onMove: (offset: number) => void;
  onClose: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (TYPING_TAGS.has(element.tagName) || element.isContentEditable || element.getAttribute?.('role') === 'textbox'));
}

function handlesOwnKeys(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return isTyping(target) || Boolean(element && (ACTIVATING_TAGS.has(element.tagName) || OWN_KEY_ROLES.has(element.getAttribute?.('role') ?? '')));
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

export function useMessageShortcuts(shortcuts: Shortcuts): void {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { active, onFocusFilter, onTogglePause, onMove, onClose } = latest.current;
      if (!active || event.defaultPrevented || hasModifier(event)) {
        return;
      }
      if (event.key === '/' && !isTyping(event.target)) {
        event.preventDefault();
        onFocusFilter();
      } else if (event.key === ' ' && !handlesOwnKeys(event.target)) {
        event.preventDefault();
        onTogglePause();
      } else if (event.key === 'Escape' && !isTyping(event.target)) {
        onClose();
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !handlesOwnKeys(event.target)) {
        event.preventDefault();
        onMove(event.key === 'ArrowDown' ? 1 : -1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
