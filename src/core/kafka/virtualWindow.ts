export interface VirtualWindow {
  start: number;
  end: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
}

export interface VirtualWindowInput {
  heights: number[];
  scrollTop: number;
  viewportHeight: number;
  overscan: number;
}

function startIndexFor(heights: number[], scrollTop: number): { index: number; offset: number } {
  let offset = 0;
  for (let index = 0; index < heights.length; index++) {
    if (offset + heights[index] > scrollTop) {
      return { index, offset };
    }
    offset += heights[index];
  }
  return { index: heights.length, offset };
}

export function computeVirtualWindow({ heights, scrollTop, viewportHeight, overscan }: VirtualWindowInput): VirtualWindow {
  const totalHeight = heights.reduce((sum, height) => sum + height, 0);
  const first = startIndexFor(heights, Math.max(0, scrollTop));
  const start = Math.max(0, first.index - overscan);
  let end = first.index;
  let reached = first.offset;
  while (end < heights.length && reached < scrollTop + viewportHeight) {
    reached += heights[end++];
  }
  end = Math.min(heights.length, end + overscan);
  const paddingTop = heights.slice(0, start).reduce((sum, height) => sum + height, 0);
  const paddingBottom = heights.slice(end).reduce((sum, height) => sum + height, 0);
  return { start, end, paddingTop, paddingBottom, totalHeight };
}
