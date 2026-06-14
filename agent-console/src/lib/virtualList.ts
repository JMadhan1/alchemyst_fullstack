/**
 * virtualList.ts — Utilities for windowed (virtual) list rendering.
 *
 * Used by TraceTimeline and JsonDiffTree to avoid rendering thousands
 * of DOM nodes when the list is large.
 */

export interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
}

/**
 * Compute which items should be rendered given:
 * - total item count
 * - fixed item height (px)
 * - container scroll offset (scrollTop)
 * - container viewport height
 * - overscan (extra items above/below viewport to pre-render)
 */
export function computeVirtualWindow(
  itemCount: number,
  itemHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan: number = 5
): VirtualWindow {
  if (itemCount === 0) {
    return { startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight: 0 };
  }

  const totalHeight = itemCount * itemHeight;
  const firstVisible = Math.floor(scrollTop / itemHeight);
  const lastVisible = Math.ceil((scrollTop + viewportHeight) / itemHeight);

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(itemCount - 1, lastVisible + overscan);
  const offsetTop = startIndex * itemHeight;

  return { startIndex, endIndex, offsetTop, totalHeight };
}

/**
 * Returns the slice of items to render, plus positioning data.
 */
export function getVisibleItems<T>(
  items: T[],
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number,
  overscan: number = 5
): { items: T[]; offsetTop: number; totalHeight: number; startIndex: number } {
  const win = computeVirtualWindow(
    items.length,
    itemHeight,
    scrollTop,
    viewportHeight,
    overscan
  );

  return {
    items: items.slice(win.startIndex, win.endIndex + 1),
    offsetTop: win.offsetTop,
    totalHeight: win.totalHeight,
    startIndex: win.startIndex,
  };
}
