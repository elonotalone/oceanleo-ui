export interface EditBarPanelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** All coordinates are viewport coordinates, including when the editor scrolls. */
export function editBarPanelGeometry({
  anchor,
  container,
  viewport,
  barBottom,
  width = 320,
}: {
  anchor: EditBarPanelRect;
  container: EditBarPanelRect;
  viewport: EditBarPanelRect;
  barBottom: number;
  width?: number;
}) {
  const leftEdge = Math.max(container.left, viewport.left) + 4;
  const rightEdge = Math.min(container.right, viewport.right) - 4;
  const bottom = Math.min(container.bottom, viewport.bottom) - 4;
  const panelWidth = Math.max(0, Math.min(width, rightEdge - leftEdge));
  // Never flip above the bar: shorten and scroll the panel instead.
  const top = Math.max(container.top, viewport.top, barBottom) + 6;
  return {
    left: Math.max(leftEdge, Math.min(anchor.left, rightEdge - panelWidth)),
    top,
    width: panelWidth,
    maxHeight: Math.max(0, Math.min(bottom - top, (viewport.bottom - viewport.top) * 0.7)),
  };
}
