export interface FloatingToolbarPoint {
  x: number;
  y: number;
}

export interface FloatingToolbarSize {
  width: number;
  height: number;
}

export interface FloatingToolbarBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Non-negative clearance between a docked edit bar's bottom edge and the
 * editor stage / website iframe top. V5 adjacency allows gap in [-2, 40];
 * keep a small positive gap so a taller floating chrome (p-1.5 + h-11 +
 * border ≈ 58–60px) cannot overlap the frame when the dock band is shorter.
 */
export const DOCKED_EDIT_BAR_STAGE_CLEARANCE_PX = 2;

/**
 * Place a docked toolbar immediately above the editor stage, horizontally
 * centered in the dock band. Anchoring to stage top (not vertical centering
 * inside a short sentinel) is what keeps website iframe gap ≥ 0.
 */
export function dockedFloatingToolbarPosition({
  layerLeft,
  layerTop,
  dock,
  stageTop,
  toolbar,
  clearancePx = DOCKED_EDIT_BAR_STAGE_CLEARANCE_PX,
}: {
  layerLeft: number;
  layerTop: number;
  dock: FloatingToolbarBounds;
  stageTop: number;
  toolbar: FloatingToolbarSize;
  clearancePx?: number;
}): FloatingToolbarPoint {
  const clearance = Number.isFinite(clearancePx)
    ? Math.max(0, clearancePx)
    : DOCKED_EDIT_BAR_STAGE_CLEARANCE_PX;
  return {
    x:
      dock.left -
      layerLeft +
      Math.max(0, (dock.right - dock.left - toolbar.width) / 2),
    y: stageTop - layerTop - toolbar.height - clearance,
  };
}

export function sameFloatingToolbarPoint(
  left: FloatingToolbarPoint,
  right: FloatingToolbarPoint,
): boolean {
  return left.x === right.x && left.y === right.y;
}

export function clampFloatingToolbar(
  point: FloatingToolbarPoint,
  container: FloatingToolbarSize,
  toolbar: FloatingToolbarSize,
  inset = 8,
): FloatingToolbarPoint {
  const maxX = Math.max(0, container.width - toolbar.width - inset * 2);
  const maxY = Math.max(0, container.height - toolbar.height - inset * 2);
  return {
    x: Math.max(0, Math.min(point.x, maxX)),
    y: Math.max(0, Math.min(point.y, maxY)),
  };
}

export function clampFloatingToolbarToBounds(
  point: FloatingToolbarPoint,
  bounds: FloatingToolbarBounds,
  toolbar: FloatingToolbarSize,
  inset = 8,
): FloatingToolbarPoint {
  const minimumX = bounds.left + inset;
  const minimumY = bounds.top + inset;
  const maximumX = Math.max(
    minimumX,
    bounds.right - toolbar.width - inset,
  );
  const maximumY = Math.max(
    minimumY,
    bounds.bottom - toolbar.height - inset,
  );
  return {
    x: Math.max(minimumX, Math.min(point.x, maximumX)),
    y: Math.max(minimumY, Math.min(point.y, maximumY)),
  };
}

export function pointNearFloatingToolbarBounds(
  point: FloatingToolbarPoint,
  bounds: FloatingToolbarBounds,
  proximity = 24,
): boolean {
  return (
    point.x >= bounds.left - proximity &&
    point.x <= bounds.right + proximity &&
    point.y >= bounds.top - proximity &&
    point.y <= bounds.bottom + proximity
  );
}

export function rectNearFloatingToolbarBounds(
  rect: FloatingToolbarBounds,
  bounds: FloatingToolbarBounds,
  proximity = 24,
): boolean {
  return (
    rect.right >= bounds.left - proximity &&
    rect.left <= bounds.right + proximity &&
    rect.bottom >= bounds.top - proximity &&
    rect.top <= bounds.bottom + proximity
  );
}

/**
 * Dock intent while dragging: raw pointer in the band, or the clamped toolbar
 * occupying the band (pointer may have overshot into chrome above the dock).
 */
export function isFloatingToolbarDockIntent(
  point: FloatingToolbarPoint,
  bounds: FloatingToolbarBounds,
  toolbar: FloatingToolbarBounds | null | undefined,
  proximity = 24,
): boolean {
  if (pointNearFloatingToolbarBounds(point, bounds, proximity)) return true;
  if (toolbar && rectNearFloatingToolbarBounds(toolbar, bounds, proximity)) {
    return true;
  }
  // Pointer leaped above the dock strip (action row / site chrome) while still
  // horizontally aligned — count as dock intent once the toolbar is already
  // pinned against the dock band.
  if (
    toolbar &&
    point.x >= bounds.left - proximity &&
    point.x <= bounds.right + proximity &&
    point.y < bounds.top + proximity &&
    toolbar.top <= bounds.bottom + proximity
  ) {
    return true;
  }
  return false;
}
