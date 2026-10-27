import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeVirtualWindow } from '../../core/kafka/virtualWindow';

const DEFAULT_ESTIMATED_HEIGHT = 120;
const DEFAULT_OVERSCAN = 5;
const DEFAULT_THRESHOLD = 60;
const DEFAULT_VIEWPORT_HEIGHT = 800;
const SCROLLER_SELECTOR = '.kafka-scroll';

interface Props<Item> {
  items: Item[];
  getKey: (item: Item) => string;
  renderItem: (item: Item) => ReactNode;
  className?: string;
  estimatedHeight?: number;
  overscan?: number;
  threshold?: number;
}

interface ScrollState {
  offset: number;
  height: number;
}

function offsetWithin(scroller: HTMLElement, element: HTMLElement): number {
  return element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

function useScrollState(rootRef: React.RefObject<HTMLDivElement>, enabled: boolean): ScrollState {
  const [state, setState] = useState<ScrollState>({ offset: 0, height: DEFAULT_VIEWPORT_HEIGHT });

  useEffect(() => {
    const root = rootRef.current;
    const scroller = root?.closest<HTMLElement>(SCROLLER_SELECTOR);
    if (!enabled || !root || !scroller) {
      return undefined;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      setState({ offset: scroller.scrollTop - offsetWithin(scroller, root), height: scroller.clientHeight || DEFAULT_VIEWPORT_HEIGHT });
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener('scroll', schedule, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    resizeObserver?.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', schedule);
      resizeObserver?.disconnect();
      frame && cancelAnimationFrame(frame);
    };
  }, [enabled, rootRef]);

  return state;
}

function useMeasuredHeights(enabled: boolean) {
  const heights = useRef(new Map<string, number>());
  const [, setVersion] = useState(0);
  const observer = useRef<ResizeObserver>();

  useEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    observer.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.virtualKey;
        const height = Math.round(entry.target.getBoundingClientRect().height);
        if (key && height > 0 && heights.current.get(key) !== height) {
          heights.current.set(key, height);
          changed = true;
        }
      }
      changed && setVersion((version) => version + 1);
    });
    return () => observer.current?.disconnect();
  }, [enabled]);

  const attach = useCallback((element: HTMLDivElement | null, previous?: HTMLDivElement | null) => {
    previous && observer.current?.unobserve(previous);
    element && observer.current?.observe(element);
  }, []);

  return { heights, attach };
}

export function VirtualList<Item>({
  items,
  getKey,
  renderItem,
  className,
  estimatedHeight = DEFAULT_ESTIMATED_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  threshold = DEFAULT_THRESHOLD,
}: Props<Item>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const virtual = items.length > threshold;
  const scroll = useScrollState(rootRef, virtual);
  const { heights, attach } = useMeasuredHeights(virtual);

  const window = useMemo(
    () =>
      virtual
        ? computeVirtualWindow({
            heights: items.map((item) => heights.current.get(getKey(item)) ?? estimatedHeight),
            scrollTop: scroll.offset,
            viewportHeight: scroll.height,
            overscan,
          })
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [virtual, items, scroll, estimatedHeight, overscan, getKey, heights.current.size],
  );

  if (!window) {
    return (
      <div ref={rootRef} className={className}>
        {items.map(renderItem)}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="kafka-virtual" style={{ paddingTop: window.paddingTop, paddingBottom: window.paddingBottom }}>
      {items.slice(window.start, window.end).map((item) => {
        const key = getKey(item);
        return (
          <VirtualRow key={key} virtualKey={key} attach={attach}>
            {renderItem(item)}
          </VirtualRow>
        );
      })}
    </div>
  );
}

interface RowProps {
  virtualKey: string;
  attach: (element: HTMLDivElement | null, previous?: HTMLDivElement | null) => void;
  children: ReactNode;
}

function VirtualRow({ virtualKey, attach, children }: RowProps) {
  const element = useRef<HTMLDivElement | null>(null);
  const setElement = useCallback(
    (next: HTMLDivElement | null) => {
      attach(next, element.current);
      element.current = next;
    },
    [attach],
  );
  return (
    <div ref={setElement} data-virtual-key={virtualKey} className="kafka-virtual-row">
      {children}
    </div>
  );
}
