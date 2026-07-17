export interface FloatingToolbarPoint {
  x: number;
  y: number;
}

export interface FloatingToolbarSize {
  width: number;
  height: number;
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
