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
