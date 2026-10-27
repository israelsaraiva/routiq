import { RefObject, useLayoutEffect } from 'react';

const MIRRORED_STYLES = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'textIndent', 'tabSize', 'wordSpacing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'textAlign', 'whiteSpace', 'overflowWrap', 'wordBreak',
] as const;

type Field = HTMLInputElement | HTMLTextAreaElement;

export function syncOverlayScroll(field: Field | null, overlay: HTMLElement | null): void {
  if (field && overlay) {
    overlay.scrollTop = field.scrollTop;
    overlay.scrollLeft = field.scrollLeft;
  }
}

function mirrorGeometry(field: Field, overlay: HTMLElement): void {
  overlay.style.left = `${field.offsetLeft + field.clientLeft}px`;
  overlay.style.top = `${field.offsetTop + field.clientTop}px`;
  overlay.style.width = `${field.clientWidth}px`;
  overlay.style.height = `${field.clientHeight}px`;
}

function mirrorTypography(field: Field, overlay: HTMLElement): void {
  const computed = getComputedStyle(field);
  for (const property of MIRRORED_STYLES) {
    overlay.style[property] = computed[property];
  }
}

export function useOverlayMirror(fieldRef: RefObject<Field>, overlayRef: RefObject<HTMLElement>, active: boolean): void {
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const overlay = overlayRef.current;
    if (active && field && overlay) {
      mirrorTypography(field, overlay);
      mirrorGeometry(field, overlay);
      syncOverlayScroll(field, overlay);
    }
  });
}

export interface CaretAnchor {
  left: number;
  top: number;
}

export function measureCaretAnchor(wrapper: HTMLElement, overlay: HTMLElement): CaretAnchor | undefined {
  const marker = overlay.querySelector('[data-caret]');
  if (!marker) {
    return undefined;
  }
  const wrapperBox = wrapper.getBoundingClientRect();
  const markerBox = marker.getBoundingClientRect();
  return { left: markerBox.left - wrapperBox.left, top: markerBox.bottom - wrapperBox.top };
}

export function findHoveredVariable(overlay: HTMLElement, clientX: number, clientY: number): HTMLElement | undefined {
  const variables = Array.from(overlay.querySelectorAll<HTMLElement>('[data-variable]'));
  return variables.find((element) =>
    Array.from(element.getClientRects()).some((box) => clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom),
  );
}
