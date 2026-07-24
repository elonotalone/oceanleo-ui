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

export function deckPreviewStagePadding(
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (viewportWidth < 560 || viewportHeight < 420) return 12;
  if (viewportWidth < 960 || viewportHeight < 640) return 20;
  return 32;
}

/**
 * Zoom is presentation-relative: 50% means "fit the complete slide". The fit
 * scale is recomputed from the live right-stage size, so the initial 50% view
 * remains fitted after responsive resizes. Values above 50% intentionally
 * overflow the stage and are scrollable.
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
  const scale =
    fitScale * (safeZoom / DECK_PREVIEW_FIT_ZOOM_PERCENT);

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
