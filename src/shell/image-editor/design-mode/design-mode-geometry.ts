/**
 * Design-mode geometry: rulers, guides, alignment, distribution and workspace
 * zoom for the merged Fabric 6 editor (task criteria 1 and 2).
 *
 * The vue-fabric-editor blueprint is Fabric 5 and Vue; nothing is copied from
 * it. What is reused is the feature list, rewritten here against Fabric 6
 * semantics.
 *
 * Everything in this file is plain geometry over `{left, top, width, height}`
 * rectangles. That is deliberate: Fabric cannot be instantiated under Node on
 * this machine (`fabric/node` needs an uncompiled `canvas.node`), so any logic
 * that lives inside a canvas callback is logic that can never be tested here.
 * See `signals/W04-carrier.md` §7.1.
 */

export interface DesignRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type GuideOrientation = "horizontal" | "vertical";

export interface DesignGuide {
  id: string;
  orientation: GuideOrientation;
  /** Artboard-local position in px along the axis the guide cuts across. */
  position: number;
  artboardId: string;
  locked?: boolean;
}

/**
 * Snap candidates are expressed in *screen* pixels, so the tolerance stays the
 * same physical distance no matter how far the user has zoomed in. The
 * existing edge-snapping engine (`editor-runtime.ts`) already works this way;
 * a design-mode guide that behaved differently would feel broken next to it.
 */
export const DESIGN_SNAP_SCREEN_PX = 6;

export const DESIGN_ZOOM = Object.freeze({
  minimum: 0.02,
  maximum: 32,
  /** Breathing room so a fitted artboard is not flush against the viewport. */
  fitPadding: 24,
});

export function clampDesignZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(DESIGN_ZOOM.maximum, Math.max(DESIGN_ZOOM.minimum, zoom));
}

/** Largest zoom at which the whole artboard still fits inside the viewport. */
export function designZoomToFit(
  artboard: { width: number; height: number },
  viewport: { width: number; height: number },
): number {
  const usableWidth = viewport.width - DESIGN_ZOOM.fitPadding * 2;
  const usableHeight = viewport.height - DESIGN_ZOOM.fitPadding * 2;
  if (usableWidth <= 0 || usableHeight <= 0) return DESIGN_ZOOM.minimum;
  if (artboard.width <= 0 || artboard.height <= 0) return 1;
  return clampDesignZoom(
    Math.min(usableWidth / artboard.width, usableHeight / artboard.height),
  );
}

export interface RulerTick {
  /** Artboard-local coordinate in px. */
  position: number;
  /** Ticks carrying a printed number; the rest are bare marks. */
  labelled: boolean;
}

/**
 * Ruler steps follow a 1 / 2 / 5 progression so the printed numbers stay
 * round at every zoom level. Choosing by "pixels between ticks on screen"
 * rather than by zoom keeps label density constant as the user zooms.
 */
export function rulerStep(zoom: number, minimumScreenGap = 60): number {
  const safeZoom = clampDesignZoom(zoom);
  const target = minimumScreenGap / safeZoom;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 1e-6)));
  for (const multiple of [1, 2, 5, 10]) {
    if (magnitude * multiple >= target) return magnitude * multiple;
  }
  return magnitude * 10;
}

export function rulerTicks(
  lengthPx: number,
  zoom: number,
  everyNthLabelled = 5,
): RulerTick[] {
  if (lengthPx <= 0) return [];
  const step = rulerStep(zoom);
  const minor = step / everyNthLabelled;
  const ticks: RulerTick[] = [];
  for (let index = 0; index * minor <= lengthPx; index += 1) {
    const position = index * minor;
    ticks.push({ position, labelled: index % everyNthLabelled === 0 });
  }
  return ticks;
}

export interface SnapCandidate {
  orientation: GuideOrientation;
  /** Artboard-local coordinate the moving edge would land on. */
  position: number;
  source: "artboard" | "object" | "guide";
  /** Which edge of the moving rectangle this candidate applies to. */
  edge: "start" | "center" | "end";
  /** Distance in screen px between the moving edge and the candidate. */
  distance: number;
}

export interface SnapResolution {
  left: number;
  top: number;
  /** Lines to paint; empty when nothing snapped. */
  lines: SnapCandidate[];
}

function edgeValues(
  rect: DesignRect,
  orientation: GuideOrientation,
): Record<"start" | "center" | "end", number> {
  const start = orientation === "vertical" ? rect.left : rect.top;
  const size = orientation === "vertical" ? rect.width : rect.height;
  return { start, center: start + size / 2, end: start + size };
}

function candidatesFor(
  orientation: GuideOrientation,
  moving: DesignRect,
  targets: readonly number[],
  source: SnapCandidate["source"],
  zoom: number,
): SnapCandidate[] {
  const values = edgeValues(moving, orientation);
  const found: SnapCandidate[] = [];
  for (const target of targets) {
    for (const edge of ["start", "center", "end"] as const) {
      const distance = Math.abs(values[edge] - target) * zoom;
      if (distance <= DESIGN_SNAP_SCREEN_PX) {
        found.push({ orientation, position: target, source, edge, distance });
      }
    }
  }
  return found;
}

/**
 * Resolves one drag position against artboard edges, sibling objects and
 * guides.
 *
 * Both axes are decided from the *original* rectangle and only then applied.
 * Deciding an axis from an already-shifted rectangle makes the result depend
 * on candidate order, which shows up as a rectangle that creeps while the
 * pointer is still.
 */
export function resolveDesignSnap(
  moving: DesignRect,
  context: {
    artboard: { width: number; height: number };
    siblings: readonly DesignRect[];
    guides: readonly DesignGuide[];
    zoom?: number;
    /** Held modifier that suspends snapping, matching the photo editor. */
    bypass?: boolean;
  },
): SnapResolution {
  const zoom = clampDesignZoom(context.zoom ?? 1);
  if (context.bypass) return { left: moving.left, top: moving.top, lines: [] };

  const verticalTargets: number[] = [
    0,
    context.artboard.width / 2,
    context.artboard.width,
  ];
  const horizontalTargets: number[] = [
    0,
    context.artboard.height / 2,
    context.artboard.height,
  ];
  for (const sibling of context.siblings) {
    verticalTargets.push(
      sibling.left,
      sibling.left + sibling.width / 2,
      sibling.left + sibling.width,
    );
    horizontalTargets.push(
      sibling.top,
      sibling.top + sibling.height / 2,
      sibling.top + sibling.height,
    );
  }

  const guideVertical = context.guides
    .filter((guide) => guide.orientation === "vertical")
    .map((guide) => guide.position);
  const guideHorizontal = context.guides
    .filter((guide) => guide.orientation === "horizontal")
    .map((guide) => guide.position);

  const vertical = [
    ...candidatesFor("vertical", moving, [0, context.artboard.width / 2, context.artboard.width], "artboard", zoom),
    ...candidatesFor("vertical", moving, verticalTargets.slice(3), "object", zoom),
    ...candidatesFor("vertical", moving, guideVertical, "guide", zoom),
  ];
  const horizontal = [
    ...candidatesFor("horizontal", moving, [0, context.artboard.height / 2, context.artboard.height], "artboard", zoom),
    ...candidatesFor("horizontal", moving, horizontalTargets.slice(3), "object", zoom),
    ...candidatesFor("horizontal", moving, guideHorizontal, "guide", zoom),
  ];

  const best = (list: SnapCandidate[]): SnapCandidate | null =>
    list.reduce<SnapCandidate | null>(
      (winner, candidate) =>
        winner === null || candidate.distance < winner.distance ? candidate : winner,
      null,
    );

  const bestVertical = best(vertical);
  const bestHorizontal = best(horizontal);

  const offsetFor = (candidate: SnapCandidate, size: number): number => {
    if (candidate.edge === "center") return candidate.position - size / 2;
    if (candidate.edge === "end") return candidate.position - size;
    return candidate.position;
  };

  return {
    left: bestVertical ? offsetFor(bestVertical, moving.width) : moving.left,
    top: bestHorizontal ? offsetFor(bestHorizontal, moving.height) : moving.top,
    lines: [bestVertical, bestHorizontal].filter(
      (line): line is SnapCandidate => line !== null,
    ),
  };
}

export type DesignAlignAction =
  | "align-left"
  | "align-center-h"
  | "align-right"
  | "align-top"
  | "align-center-v"
  | "align-bottom"
  | "distribute-h"
  | "distribute-v";

export const DESIGN_ALIGN_ACTIONS: readonly DesignAlignAction[] = Object.freeze([
  "align-left",
  "align-center-h",
  "align-right",
  "align-top",
  "align-center-v",
  "align-bottom",
  "distribute-h",
  "distribute-v",
]);

/** Distribution needs a fixed first and last item plus something in between. */
export const DESIGN_DISTRIBUTE_MINIMUM = 3;
export const DESIGN_ALIGN_MINIMUM = 2;

export function designAlignRequires(action: DesignAlignAction): number {
  return action.startsWith("distribute")
    ? DESIGN_DISTRIBUTE_MINIMUM
    : DESIGN_ALIGN_MINIMUM;
}

/**
 * Returns the new `left`/`top` for each input rectangle, in input order.
 *
 * Positions are returned rather than mutated so the caller decides how they
 * reach the canvas — which is also what makes this testable without Fabric.
 * Too few rectangles is a no-op, not an error: the toolbar disables the
 * button, and throwing would turn a mis-click into a crash.
 */
export function designAlign(
  rects: readonly DesignRect[],
  action: DesignAlignAction,
): { left: number; top: number }[] {
  const identity = rects.map((rect) => ({ left: rect.left, top: rect.top }));
  if (rects.length < designAlignRequires(action)) return identity;

  switch (action) {
    case "align-left": {
      const edge = Math.min(...rects.map((rect) => rect.left));
      return rects.map((rect) => ({ left: edge, top: rect.top }));
    }
    case "align-right": {
      const edge = Math.max(...rects.map((rect) => rect.left + rect.width));
      return rects.map((rect) => ({ left: edge - rect.width, top: rect.top }));
    }
    case "align-center-h": {
      const centre =
        rects.reduce((sum, rect) => sum + rect.left + rect.width / 2, 0) /
        rects.length;
      return rects.map((rect) => ({
        left: centre - rect.width / 2,
        top: rect.top,
      }));
    }
    case "align-top": {
      const edge = Math.min(...rects.map((rect) => rect.top));
      return rects.map((rect) => ({ left: rect.left, top: edge }));
    }
    case "align-bottom": {
      const edge = Math.max(...rects.map((rect) => rect.top + rect.height));
      return rects.map((rect) => ({ left: rect.left, top: edge - rect.height }));
    }
    case "align-center-v": {
      const centre =
        rects.reduce((sum, rect) => sum + rect.top + rect.height / 2, 0) /
        rects.length;
      return rects.map((rect) => ({
        left: rect.left,
        top: centre - rect.height / 2,
      }));
    }
    case "distribute-h":
      return distribute(rects, "horizontal");
    case "distribute-v":
      return distribute(rects, "vertical");
    default:
      return identity;
  }
}

/**
 * Equal *gaps* between neighbours, not equal centre spacing: with mixed widths
 * those differ, and equal gaps is what the eye reads as evenly spread. The
 * outermost two rectangles stay put and define the span.
 */
function distribute(
  rects: readonly DesignRect[],
  axis: "horizontal" | "vertical",
): { left: number; top: number }[] {
  const start = (rect: DesignRect) => (axis === "horizontal" ? rect.left : rect.top);
  const size = (rect: DesignRect) => (axis === "horizontal" ? rect.width : rect.height);

  const order = rects
    .map((rect, index) => ({ rect, index }))
    .sort((a, b) => start(a.rect) - start(b.rect));

  const first = order[0].rect;
  const last = order[order.length - 1].rect;
  const span = start(last) + size(last) - start(first);
  const occupied = order.reduce((sum, entry) => sum + size(entry.rect), 0);
  const gap = (span - occupied) / (order.length - 1);

  const positions = rects.map((rect) => ({ left: rect.left, top: rect.top }));
  let cursor = start(first) + size(first);
  for (let position = 1; position < order.length - 1; position += 1) {
    const entry = order[position];
    const placed = cursor + gap;
    if (axis === "horizontal") positions[entry.index].left = placed;
    else positions[entry.index].top = placed;
    cursor = placed + size(entry.rect);
  }
  return positions;
}

/**
 * Guides live per artboard and are clamped to it, so dragging one off the edge
 * parks it on the boundary instead of leaving an unreachable line behind.
 */
export function clampGuide(
  guide: DesignGuide,
  artboard: { width: number; height: number },
): DesignGuide {
  const limit = guide.orientation === "vertical" ? artboard.width : artboard.height;
  return {
    ...guide,
    position: Math.min(limit, Math.max(0, guide.position)),
  };
}
