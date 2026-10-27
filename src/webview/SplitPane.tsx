import { LayoutLeftIcon, LayoutTopIcon } from '@hugeicons/core-free-icons';
import { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from './components/IconButton';

type Orientation = 'vertical' | 'horizontal';

interface Layout {
  orientation: Orientation;
  ratio: number;
}

interface Props {
  first: ReactNode;
  second: ReactNode;
}

const STORAGE_KEY = 'routiq.splitLayout';
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;
const KEYBOARD_STEP = 0.03;
const DEFAULT_LAYOUT: Layout = { orientation: 'vertical', ratio: 0.5 };

function clampRatio(ratio: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

function loadLayout(): Layout {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && (stored.orientation === 'vertical' || stored.orientation === 'horizontal') && typeof stored.ratio === 'number') {
      return { orientation: stored.orientation, ratio: clampRatio(stored.ratio) };
    }
  } catch {
    return DEFAULT_LAYOUT;
  }
  return DEFAULT_LAYOUT;
}

function saveLayout(layout: Layout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    return;
  }
}

export function SplitPane({ first, second }: Props) {
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontal = layout.orientation === 'horizontal';

  useEffect(() => saveLayout(layout), [layout]);

  const setRatio = useCallback((ratio: number) => setLayout((current) => ({ ...current, ratio: clampRatio(ratio) })), []);

  const ratioFromPointer = (event: ReactPointerEvent<HTMLDivElement>): number | undefined => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) {
      return undefined;
    }
    return horizontal
      ? (event.clientX - bounds.left) / bounds.width
      : (event.clientY - bounds.top) / bounds.height;
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const ratio = dragging ? ratioFromPointer(event) : undefined;
    if (ratio !== undefined) {
      setRatio(ratio);
    }
  };
  const endDrag = () => setDragging(false);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (event.key === decrease) {
      event.preventDefault();
      setRatio(layout.ratio - KEYBOARD_STEP);
    } else if (event.key === increase) {
      event.preventDefault();
      setRatio(layout.ratio + KEYBOARD_STEP);
    }
  };

  const toggleOrientation = () =>
    setLayout((current) => ({ ...current, orientation: current.orientation === 'vertical' ? 'horizontal' : 'vertical' }));

  const percent = Math.round(layout.ratio * 100);
  const sizeProperty = horizontal ? 'width' : 'height';

  return (
    <div className={`split split-${layout.orientation}${dragging ? ' split-dragging' : ''}`} ref={containerRef}>
      <div className="split-pane split-first" style={{ [sizeProperty]: `${layout.ratio * 100}%` }}>
        {first}
      </div>
      <div
        className="split-handle"
        role="separator"
        tabIndex={0}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-label="Resize request and response panes"
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        aria-valuenow={percent}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setRatio(DEFAULT_LAYOUT.ratio)}
        onKeyDown={onKeyDown}
      />
      <div className="split-pane split-second">
        <div className="split-layout-toggle">
          <IconButton
            icon={horizontal ? LayoutTopIcon : LayoutLeftIcon}
            label="Toggle split orientation"
            tooltip={horizontal ? 'Stack request above response' : 'Place request and response side by side'}
            onClick={toggleOrientation}
          />
        </div>
        {second}
      </div>
    </div>
  );
}
