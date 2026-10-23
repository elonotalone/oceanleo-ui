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
 * Place a docked toolbar over the editor stage's top edge, horizontally
 * centered on the zero-height dock host's sentinel. The sentinel remains a
 * drop target but contributes no layout height, so the editor never jumps.
 */
export function dockedFloatingToolbarPosition({
  layerLeft,
  layerTop,
  dock,
  toolbar,
}: {
  layerLeft: number;
  layerTop: number;
  dock: FloatingToolbarBounds;
  toolbar: FloatingToolbarSize;
}): FloatingToolbarPoint {
  return {
    x:
      dock.left -
      layerLeft +
      Math.max(0, (dock.right - dock.left - toolbar.width) / 2),
    y: dock.top - layerTop,
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

/**
 * 编辑栏避让（2026-10-23 D3/W03）：编辑器侧栏（缩略图栏、图层栏、页面栏）在根元素上
 * 标 `data-edit-bar-avoid`。展开态的栏不许盖住它们：撞上就整体移到侧栏外侧
 * （优先离开侧栏、朝空的一边走）；移不开（栏比剩余空间宽）时保左端可见，宽度由
 * 「更多」折叠与 `editBarAvoidInset` 收窄的容量兜住。坐标都是图层局部坐标。
 */
export const EDIT_BAR_AVOID_SELECTOR = "[data-edit-bar-avoid]";

export function readEditBarAvoidRects(
  scope: ParentNode | null | undefined,
  origin: { left: number; top: number },
): FloatingToolbarBounds[] {
  if (!scope) return [];
  const rects: FloatingToolbarBounds[] = [];
  for (const element of Array.from(
    scope.querySelectorAll<HTMLElement>(EDIT_BAR_AVOID_SELECTOR),
  )) {
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) continue;
    rects.push({
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      right: rect.right - origin.left,
      bottom: rect.bottom - origin.top,
    });
  }
  return rects;
}

export function avoidFloatingToolbarRects(
  point: FloatingToolbarPoint,
  toolbar: FloatingToolbarSize,
  avoid: readonly FloatingToolbarBounds[],
  bounds: FloatingToolbarBounds,
  gap = 8,
): FloatingToolbarPoint {
  if (avoid.length === 0) return point;
  const overlaps = (x: number, rect: FloatingToolbarBounds) =>
    x < rect.right + gap &&
    x + toolbar.width > rect.left - gap &&
    point.y < rect.bottom &&
    point.y + toolbar.height > rect.top;
  let x = point.x;
  let leftFloor = bounds.left + gap;
  for (let pass = 0; pass < avoid.length + 1; pass += 1) {
    const hit = avoid.find((rect) => overlaps(x, rect));
    if (!hit) break;
    const roomRight = bounds.right - hit.right;
    const roomLeft = hit.left - bounds.left;
    const toRight =
      x + toolbar.width / 2 >= (hit.left + hit.right) / 2 || roomRight >= roomLeft;
    if (toRight) {
      x = hit.right + gap;
      leftFloor = Math.max(leftFloor, x);
    } else {
      x = hit.left - gap - toolbar.width;
    }
  }
  const maxX = bounds.right - toolbar.width - gap;
  // 太宽放不下：保住左端（操作员截图里被盖住的正是左端），右边交给容量收窄。
  return { x: Math.max(leftFloor, Math.min(x, Math.max(leftFloor, maxX))), y: point.y };
}

/** 边界两侧被避让元素占去的宽度（px，视口坐标）；容量计算据此收窄，让栏先折进「更多」。 */
export function editBarAvoidInset(boundary: HTMLElement | null): number {
  if (!boundary) return 0;
  const box = boundary.getBoundingClientRect();
  const scope = boundary.parentElement?.parentElement || boundary.parentElement;
  let left = 0;
  let right = 0;
  for (const element of Array.from(
    scope?.querySelectorAll<HTMLElement>(EDIT_BAR_AVOID_SELECTOR) || [],
  )) {
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) continue;
    if (rect.right <= box.left || rect.left >= box.right) continue;
    const overlap = Math.min(rect.right, box.right) - Math.max(rect.left, box.left);
    if (rect.left <= box.left + 1) left = Math.max(left, overlap);
    else if (rect.right >= box.right - 1) right = Math.max(right, overlap);
  }
  return left + right;
}
