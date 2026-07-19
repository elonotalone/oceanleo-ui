export const MIN_TIMELINE_PX_PER_SECOND = 8;
export const MAX_TIMELINE_PX_PER_SECOND = 480;

export interface TimelineClientPoint {
  clientX: number;
  clientY: number;
}

export interface TimelineContentGeometry {
  left: number;
  top: number;
  bottom: number;
  pxPerSecond: number;
}

export function clampTimelinePxPerSecond(value: number): number {
  return Math.min(
    MAX_TIMELINE_PX_PER_SECOND,
    Math.max(MIN_TIMELINE_PX_PER_SECOND, Math.round(value)),
  );
}

/**
 * Translate a viewport point to timeline time. The content rect's left edge
 * already includes horizontal scrolling, so drops keep their intended time
 * when the timeline is scrolled.
 */
export function timelineMsAtClientPoint(
  point: TimelineClientPoint,
  geometry: TimelineContentGeometry | null,
  fallbackMs: number,
): number {
  if (
    !geometry ||
    point.clientY < geometry.top ||
    point.clientY > geometry.bottom ||
    !Number.isFinite(geometry.pxPerSecond) ||
    geometry.pxPerSecond <= 0
  ) {
    return fallbackMs;
  }
  return Math.max(
    0,
    Math.round(
      ((point.clientX - geometry.left) / geometry.pxPerSecond) * 1_000,
    ),
  );
}

export function timelineAnchorMs(
  scrollLeft: number,
  offsetInViewport: number,
  pxPerSecond: number,
): number {
  if (!Number.isFinite(pxPerSecond) || pxPerSecond <= 0) return 0;
  return (
    (Math.max(0, scrollLeft) + Math.max(0, offsetInViewport)) /
    pxPerSecond
  ) * 1_000;
}

export function timelineScrollLeftForAnchor(
  anchorMs: number,
  offsetInViewport: number,
  pxPerSecond: number,
): number {
  if (!Number.isFinite(pxPerSecond) || pxPerSecond <= 0) return 0;
  return Math.max(
    0,
    (Math.max(0, anchorMs) / 1_000) * pxPerSecond -
      Math.max(0, offsetInViewport),
  );
}
