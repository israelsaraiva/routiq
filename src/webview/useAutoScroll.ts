import { RefObject, useEffect } from 'react';

export function useAutoScroll(container: RefObject<HTMLElement>, enabled: boolean, trigger: unknown): void {
  useEffect(() => {
    const element = container.current;
    if (enabled && element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [container, enabled, trigger]);
}
