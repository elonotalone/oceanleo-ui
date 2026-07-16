export interface DeckInkPoint {
  x: number;
  y: number;
}

export type DeckInkStroke = DeckInkPoint[];

export interface DeckInkStyle {
  color: string;
  width: number;
  opacity: number;
  highlighter?: boolean;
}

export interface DeckInkAsset {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function finitePoint(point: DeckInkPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function pathFor(points: DeckInkStroke, offsetX: number, offsetY: number): string {
  const safe = points.filter(finitePoint);
  if (!safe.length) return "";
  const local = safe.map((point) => ({
    x: (point.x - offsetX) * 10,
    y: (point.y - offsetY) * 10,
  }));
  if (local.length === 1) {
    return `M ${local[0].x.toFixed(2)} ${local[0].y.toFixed(2)} l 0.01 0`;
  }
  let path = `M ${local[0].x.toFixed(2)} ${local[0].y.toFixed(2)}`;
  for (let index = 1; index < local.length - 1; index += 1) {
    const point = local[index];
    const next = local[index + 1];
    const middleX = (point.x + next.x) / 2;
    const middleY = (point.y + next.y) / 2;
    path += ` Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${middleX.toFixed(2)} ${middleY.toFixed(2)}`;
  }
  const last = local[local.length - 1];
  path += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return path;
}

function encodedSvg(
  strokes: DeckInkStroke[],
  style: DeckInkStyle,
  bounds: { x: number; y: number; width: number; height: number },
): string {
  const color = /^#[0-9a-f]{3,8}$/i.test(style.color) ? style.color : "#111827";
  const opacity = Math.min(1, Math.max(0.05, style.opacity));
  const strokeWidth = Math.max(1.1, style.width * 1.04);
  const paths = strokes
    .map((stroke) => pathFor(stroke, bounds.x, bounds.y))
    .filter(Boolean)
    .map(
      (path) =>
        `<path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity.toFixed(3)}"/>`,
    )
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${(bounds.width * 10).toFixed(2)} ${(bounds.height * 10).toFixed(2)}" ` +
    `preserveAspectRatio="none">${paths}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Turn one or more slide-percent strokes into a transparent SVG image element.
 * Canvas strokes preserve their original slide position. Signature-pad strokes
 * are normalized into a centered, movable signature object.
 */
export function buildDeckInkAsset(
  strokes: DeckInkStroke[],
  style: DeckInkStyle,
  placement: "canvas" | "signature" = "canvas",
): DeckInkAsset | null {
  const safeStrokes = strokes
    .map((stroke) => stroke.filter(finitePoint))
    .filter((stroke) => stroke.length > 0);
  const points = safeStrokes.flat();
  if (!points.length) return null;

  const minimumX = Math.min(...points.map((point) => point.x));
  const maximumX = Math.max(...points.map((point) => point.x));
  const minimumY = Math.min(...points.map((point) => point.y));
  const maximumY = Math.max(...points.map((point) => point.y));
  const padding = Math.max(0.35, style.width / 9.6);
  const sourceBounds = {
    x: minimumX - padding,
    y: minimumY - padding,
    width: Math.max(0.8, maximumX - minimumX + padding * 2),
    height: Math.max(0.8, maximumY - minimumY + padding * 2),
  };
  const src = encodedSvg(safeStrokes, style, sourceBounds);
  if (placement === "signature") {
    const sourceRatio = sourceBounds.width / sourceBounds.height;
    const width = Math.min(48, Math.max(24, sourceRatio * 18));
    const height = Math.min(24, Math.max(10, width / Math.max(1, sourceRatio)));
    return {
      src,
      x: (100 - width) / 2,
      y: (100 - height) / 2,
      width,
      height,
    };
  }
  return {
    src,
    x: Math.max(-2, sourceBounds.x),
    y: Math.max(-2, sourceBounds.y),
    width: Math.min(104, sourceBounds.width),
    height: Math.min(104, sourceBounds.height),
  };
}

export function deckInkPath(
  points: DeckInkStroke,
): string {
  return pathFor(points, 0, 0);
}
