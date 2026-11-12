import type { DeckAspect } from "./deck-schema";

/** Physical width used by PPTX: 13 1/3 in wide, 10 in for 4:3. */
export function deckPageWidthPt(aspect: DeckAspect): number {
  return aspect === "4:3" ? 720 : 960;
}

/** One cqi is 1% of the slide container's inline size. */
export function deckFontSizeCqi(fontSizePt: number, aspect: DeckAspect): number {
  return fontSizePt / (deckPageWidthPt(aspect) / 100);
}

export function deckFontSizePx(
  fontSizePt: number,
  aspect: DeckAspect,
  canvasWidthPx: number,
): number {
  return (deckFontSizeCqi(fontSizePt, aspect) / 100) * canvasWidthPx;
}

/** Read back the same scale; keep stored point sizes stable to 0.01 pt. */
export function deckFontSizePt(
  fontSizePx: number,
  aspect: DeckAspect,
  canvasWidthPx: number,
): number {
  return Math.round((fontSizePx / deckFontSizePx(1, aspect, canvasWidthPx)) * 100) / 100;
}
