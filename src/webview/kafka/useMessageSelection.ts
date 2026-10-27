import { useCallback, useState } from 'react';

export interface MessageSelection {
  selectedIds: Set<string>;
  toggle: (messageIds: string[], selected: boolean) => void;
  clear: () => void;
}

export function useMessageSelection(): MessageSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggle = useCallback((messageIds: string[], selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      messageIds.forEach((id) => (selected ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);
  return { selectedIds, toggle, clear };
}
