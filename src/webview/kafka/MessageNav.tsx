import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface MessageNav {
  activeId: string | null;
  openId: string | null;
  activate: (messageId: string) => void;
  open: (messageId: string) => void;
  close: () => void;
  move: (offset: number) => void;
}

const NO_OP_NAV: MessageNav = { activeId: null, openId: null, activate: () => undefined, open: () => undefined, close: () => undefined, move: () => undefined };

export const MessageNavContext = createContext<MessageNav>(NO_OP_NAV);

export function useMessageNav(): MessageNav {
  return useContext(MessageNavContext);
}

export function useMessageNavState(orderedIds: string[]): MessageNav {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const open = useCallback((messageId: string) => {
    setActiveId(messageId);
    setOpenId(messageId);
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
      setOpenId((current) => (current === null ? null : nextId));
    },
    [orderedIds, activeId],
  );

  const close = useCallback(() => setOpenId(null), []);

  return useMemo(() => ({ activeId, openId, activate: setActiveId, open, close, move }), [activeId, openId, open, close, move]);
}
