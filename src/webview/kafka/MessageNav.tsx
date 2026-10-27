import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface MessageNav {
  activeId: string | null;
  expandedId: string | null;
  activate: (messageId: string) => void;
  toggleExpanded: (messageId: string) => void;
  collapse: () => void;
  move: (offset: number) => void;
}

const NO_OP_NAV: MessageNav = { activeId: null, expandedId: null, activate: () => undefined, toggleExpanded: () => undefined, collapse: () => undefined, move: () => undefined };

export const MessageNavContext = createContext<MessageNav>(NO_OP_NAV);

export function useMessageNav(): MessageNav {
  return useContext(MessageNavContext);
}

export function useMessageNavState(orderedIds: string[]): MessageNav {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpanded = useCallback((messageId: string) => {
    setActiveId(messageId);
    setExpandedId((current) => (current === messageId ? null : messageId));
  }, []);

  const move = useCallback(
    (offset: number) => {
      if (orderedIds.length === 0) {
        return;
      }
      const currentIndex = activeId ? orderedIds.indexOf(activeId) : -1;
      const nextIndex = Math.min(Math.max(currentIndex + offset, 0), orderedIds.length - 1);
      const nextId = orderedIds[nextIndex];
      setActiveId(nextId);
      setExpandedId((current) => (current === null ? null : nextId));
    },
    [orderedIds, activeId],
  );

  const collapse = useCallback(() => setExpandedId(null), []);

  return useMemo(() => ({ activeId, expandedId, activate: setActiveId, toggleExpanded, collapse, move }), [activeId, expandedId, toggleExpanded, collapse, move]);
}
