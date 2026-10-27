import { KeyboardEvent, PointerEvent, useRef } from 'react';

const KEY_STEP = 24;
const KEY_STEP_LARGE = 96;

export type PanelSide = 'right' | 'bottom';

interface Props {
  side: PanelSide;
  size: number;
  min: number;
  max: number;
  label: string;
  onResize: (size: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

function growthKeys(side: PanelSide): { grow: string; shrink: string } {
  return side === 'right' ? { grow: 'ArrowLeft', shrink: 'ArrowRight' } : { grow: 'ArrowUp', shrink: 'ArrowDown' };
}

function nextSize(event: KeyboardEvent, side: PanelSide, size: number, min: number, max: number): number | undefined {
  const { grow, shrink } = growthKeys(side);
  const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
  switch (event.key) {
    case grow:
      return clamp(size + step, min, max);
    case shrink:
      return clamp(size - step, min, max);
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return undefined;
  }
}

export function ResizeHandle({ side, size, min, max, label, onResize }: Props) {
  const drag = useRef<{ origin: number; startSize: number } | null>(null);
  const coordinate = (event: PointerEvent) => (side === 'right' ? event.clientX : event.clientY);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextSize(event, side, size, min, max);
    if (next !== undefined) {
      event.preventDefault();
      onResize(next);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { origin: coordinate(event), startSize: size };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    drag.current && onResize(clamp(drag.current.startSize + drag.current.origin - coordinate(event), min, max));
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={side === 'right' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={max}
      className="kafka-resize-handle"
      data-side={side}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}
