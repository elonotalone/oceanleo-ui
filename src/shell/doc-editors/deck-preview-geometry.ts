export const DECK_PREVIEW_FIT_ZOOM_PERCENT = 50;
export const DECK_PREVIEW_LOGICAL_WIDTH = 960;

export interface DeckPreviewLogicalSize {
  width: number;
  height: number;
}

export interface DeckPreviewFitGeometry {
  logicalWidth: number;
  logicalHeight: number;
  padding: number;
  availableWidth: number;
  availableHeight: number;
  fitScale: number;
  scale: number;
  width: number;
  height: number;
  zoomPercent: number;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Deck renderers share one stable 960px logical width. Consumers only need to
 * provide the source aspect ratio; PPTX dimensions may be EMUs or pixels.
 */
export function deckPreviewLogicalSize(
  aspectRatio = 16 / 9,
): DeckPreviewLogicalSize {
  const ratio = finitePositive(aspectRatio, 16 / 9);
  return {
    width: DECK_PREVIEW_LOGICAL_WIDTH,
    height: DECK_PREVIEW_LOGICAL_WIDTH / ratio,
  };
}

/** Stable light-DOM thumbnail aspect; matches the fitted stage frame. */
export function deckPreviewThumbnailAspect(
  logicalSize: DeckPreviewLogicalSize = deckPreviewLogicalSize(),
): number {
  return (
    finitePositive(logicalSize.width, DECK_PREVIEW_LOGICAL_WIDTH) /
    finitePositive(
      logicalSize.height,
      DECK_PREVIEW_LOGICAL_WIDTH * (9 / 16),
    )
  );
}

export function deckPreviewStagePadding(
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (viewportWidth < 560 || viewportHeight < 420) return 12;
  if (viewportWidth < 960 || viewportHeight < 640) return 20;
  return 32;
}

/**
 * Remaining viewport below the layout root. Always used as `maxHeight`.
 * A definite `height` is applied only when unconstrained content would
 * overflow the cap (see `deckPreviewNeedsDefiniteViewportHeight`).
 */
export function deckPreviewViewportCapPx(
  layoutTop: number,
  viewportInnerHeight: number,
  floor = 280,
  gutter = 4,
): number {
  const top = Number.isFinite(layoutTop) ? layoutTop : 0;
  const inner = finitePositive(viewportInnerHeight, floor);
  const safeGutter = Number.isFinite(gutter) ? Math.max(0, gutter) : 0;
  const safeFloor = finitePositive(floor, 280);
  return Math.max(safeFloor, Math.floor(inner - top - safeGutter));
}

/**
 * Intrinsic height of the deck preview layout for N rail thumbnails.
 * Matches DeckPreviewLayout chrome: ~32px rail header, p-2, space-y-2.5,
 * and 16:9 thumbs at the common ~143px content width (159px rail − padding).
 */
export function deckPreviewEstimatedLayoutContentHeightPx(
  slideCount: number,
  options?: {
    thumbContentWidthPx?: number;
    aspectRatio?: number;
    headerPx?: number;
    railPaddingYPx?: number;
    gapPx?: number;
  },
): number {
  const n = Math.max(0, Math.floor(slideCount));
  const headerPx = finitePositive(options?.headerPx ?? 32, 32);
  const railPaddingYPx = finitePositive(options?.railPaddingYPx ?? 16, 16);
  const gapPx = Number.isFinite(options?.gapPx) ? Math.max(0, options!.gapPx!) : 10;
  const thumbWidth = finitePositive(options?.thumbContentWidthPx ?? 143, 143);
  const aspect = finitePositive(options?.aspectRatio ?? 16 / 9, 16 / 9);
  const thumbHeight = thumbWidth / aspect;
  const listPx =
    n === 0 ? 0 : n * thumbHeight + Math.max(0, n - 1) * gapPx;
  return Math.ceil(headerPx + railPaddingYPx + listPx);
}

/** Definite height is required only when content would overflow the cap. */
export function deckPreviewNeedsDefiniteViewportHeight(
  capPx: number,
  contentHeightPx: number,
): boolean {
  if (!Number.isFinite(capPx) || capPx <= 0) return false;
  if (!Number.isFinite(contentHeightPx) || contentHeightPx <= 0) return false;
  return contentHeightPx > Math.floor(capPx);
}

/**
 * Viewport cap inline style.
 * - Always `maxHeight` so the root cannot spill past the window.
 * - Definite `height` + `minHeight:0` only when content overflows the cap
 *   (compact / short stages that need a flex scrollport).
 * - Otherwise `height:auto` overrides Tailwind `h-full` so tall desktop
 *   workbenches shrink to content and keep 50%-fit stage occupancy.
 */
export function deckPreviewViewportCapStyle(
  capPx: number | null | undefined,
  contentHeightPx?: number | null,
): {
  height?: string;
  maxHeight?: string;
  minHeight?: number;
} {
  if (capPx == null || !Number.isFinite(capPx) || capPx <= 0) return {};
  const cap = Math.floor(capPx);
  const maxHeight = `${cap}px`;
  // Unknown content → keep definite height (fail-safe for compact scroll).
  const needsDefinite =
    contentHeightPx == null || !Number.isFinite(contentHeightPx)
      ? true
      : deckPreviewNeedsDefiniteViewportHeight(cap, contentHeightPx);
  if (needsDefinite) {
    return {
      height: maxHeight,
      maxHeight,
      // Defeat consumer min-h-[520px] when the live viewport is tighter.
      minHeight: 0,
    };
  }
  return {
    height: "auto",
    maxHeight,
  };
}

/**
 * Zoom is absolute against the logical page: 50% ⇒ scale 0.5. When the
 * requested scale would clip the complete slide, it is capped to the live
 * right-stage fitScale (min of width/height after padding). Zoom above 50%
 * keeps the absolute scale so the stage can scroll.
 */
export function deckPreviewFitGeometry({
  viewportWidth,
  viewportHeight,
  logicalSize,
  zoomPercent = DECK_PREVIEW_FIT_ZOOM_PERCENT,
  padding = deckPreviewStagePadding(viewportWidth, viewportHeight),
}: {
  viewportWidth: number;
  viewportHeight: number;
  logicalSize: DeckPreviewLogicalSize;
  zoomPercent?: number;
  padding?: number;
}): DeckPreviewFitGeometry {
  const logicalWidth = finitePositive(
    logicalSize.width,
    DECK_PREVIEW_LOGICAL_WIDTH,
  );
  const logicalHeight = finitePositive(
    logicalSize.height,
    DECK_PREVIEW_LOGICAL_WIDTH * (9 / 16),
  );
  const safeViewportWidth = finitePositive(viewportWidth, logicalWidth);
  const safeViewportHeight = finitePositive(viewportHeight, logicalHeight);
  const safePadding = clamp(
    Number.isFinite(padding) ? padding : 0,
    0,
    Math.max(
      0,
      Math.min(safeViewportWidth, safeViewportHeight) / 2 - 0.5,
    ),
  );
  const availableWidth = Math.max(1, safeViewportWidth - safePadding * 2);
  const availableHeight = Math.max(1, safeViewportHeight - safePadding * 2);
  const fitScale = Math.min(
    availableWidth / logicalWidth,
    availableHeight / logicalHeight,
  );
  const safeZoom = clamp(
    Number.isFinite(zoomPercent)
      ? zoomPercent
      : DECK_PREVIEW_FIT_ZOOM_PERCENT,
    10,
    300,
  );
  const requestedScale = safeZoom / 100;
  const scale =
    safeZoom <= DECK_PREVIEW_FIT_ZOOM_PERCENT
      ? Math.min(requestedScale, fitScale)
      : requestedScale;

  return {
    logicalWidth,
    logicalHeight,
    padding: safePadding,
    availableWidth,
    availableHeight,
    fitScale,
    scale,
    width: logicalWidth * scale,
    height: logicalHeight * scale,
    zoomPercent: safeZoom,
  };
}
