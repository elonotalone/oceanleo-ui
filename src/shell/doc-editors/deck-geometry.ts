import type { DeckElement } from "./deck-schema";

export type DeckResizeHandle =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

export interface DeckCanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DeckPointer {
  x: number;
  y: number;
}

export function clientPointToDeckPercent(
  point: DeckPointer,
  rect: DeckCanvasRect,
): DeckPointer {
  if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
  return {
    x: ((point.x - rect.left) / rect.width) * 100,
    y: ((point.y - rect.top) / rect.height) * 100,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function moveDeckElement(
  element: DeckElement,
  start: DeckPointer,
  current: DeckPointer,
  rect: DeckCanvasRect,
): Pick<DeckElement, "x" | "y"> {
  const dx = ((current.x - start.x) / Math.max(1, rect.width)) * 100;
  const dy = ((current.y - start.y) / Math.max(1, rect.height)) * 100;
  return {
    x: clamp(element.x + dx, 0, Math.max(0, 100 - element.width)),
    y: clamp(element.y + dy, 0, Math.max(0, 100 - element.height)),
  };
}

export function resizeDeckElement(
  element: DeckElement,
  handle: DeckResizeHandle,
  start: DeckPointer,
  current: DeckPointer,
  rect: DeckCanvasRect,
  lockAspect = false,
): Pick<DeckElement, "x" | "y" | "width" | "height"> {
  const radians = ((element.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const screenDx = current.x - start.x;
  const screenDy = current.y - start.y;
  const localDx = screenDx * cos + screenDy * sin;
  const localDy = -screenDx * sin + screenDy * cos;
  const initialWidth = (element.width / 100) * rect.width;
  const initialHeight = (element.height / 100) * rect.height;
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const minimum = 12;
  let nextWidth = Math.max(
    minimum,
    initialWidth + (east ? localDx : west ? -localDx : 0),
  );
  let nextHeight = Math.max(
    minimum,
    initialHeight + (south ? localDy : north ? -localDy : 0),
  );

  if (lockAspect && (east || west) && (north || south)) {
    const ratio = initialWidth / Math.max(1, initialHeight);
    if (Math.abs(nextWidth - initialWidth) >= Math.abs(nextHeight - initialHeight)) {
      nextHeight = nextWidth / ratio;
    } else {
      nextWidth = nextHeight * ratio;
    }
  }

  const widthChange = nextWidth - initialWidth;
  const heightChange = nextHeight - initialHeight;
  const localCenterShiftX = east
    ? widthChange / 2
    : west
      ? -widthChange / 2
      : 0;
  const localCenterShiftY = south
    ? heightChange / 2
    : north
      ? -heightChange / 2
      : 0;
  const centerShiftX =
    localCenterShiftX * cos - localCenterShiftY * sin;
  const centerShiftY =
    localCenterShiftX * sin + localCenterShiftY * cos;
  const initialCenterX =
    ((element.x + element.width / 2) / 100) * rect.width;
  const initialCenterY =
    ((element.y + element.height / 2) / 100) * rect.height;
  const nextWidthPercent = (nextWidth / rect.width) * 100;
  const nextHeightPercent = (nextHeight / rect.height) * 100;
  const nextCenterXPercent =
    ((initialCenterX + centerShiftX) / rect.width) * 100;
  const nextCenterYPercent =
    ((initialCenterY + centerShiftY) / rect.height) * 100;

  return {
    width: clamp(nextWidthPercent, 1, 200),
    height: clamp(nextHeightPercent, 1, 200),
    x: clamp(nextCenterXPercent - nextWidthPercent / 2, -100, 200),
    y: clamp(nextCenterYPercent - nextHeightPercent / 2, -100, 200),
  };
}

export function rotateDeckElement(
  element: DeckElement,
  start: DeckPointer,
  current: DeckPointer,
  rect: DeckCanvasRect,
  snap = false,
): Pick<DeckElement, "rotation"> {
  const centerX = rect.left + ((element.x + element.width / 2) / 100) * rect.width;
  const centerY = rect.top + ((element.y + element.height / 2) / 100) * rect.height;
  const startAngle = Math.atan2(start.y - centerY, start.x - centerX);
  const currentAngle = Math.atan2(current.y - centerY, current.x - centerX);
  let rotation =
    (element.rotation || 0) + ((currentAngle - startAngle) * 180) / Math.PI;
  rotation = ((rotation % 360) + 360) % 360;
  if (snap) rotation = Math.round(rotation / 15) * 15;
  return { rotation: Math.round(rotation * 10) / 10 };
}

export function centeredDeckPlacement(
  width: number,
  height: number,
  point?: DeckPointer,
): Pick<DeckElement, "x" | "y" | "width" | "height"> {
  const center = point || { x: 50, y: 50 };
  return {
    width,
    height,
    x: clamp(center.x - width / 2, 0, Math.max(0, 100 - width)),
    y: clamp(center.y - height / 2, 0, Math.max(0, 100 - height)),
  };
}
