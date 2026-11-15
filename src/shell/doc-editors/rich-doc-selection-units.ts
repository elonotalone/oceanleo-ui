import { parseRichDocLineHeight } from "./rich-doc-model";

const HEADING_FONT_SCALE: Readonly<Record<number, number>> = { 1: 1.9, 2: 1.5, 3: 1.25, 4: 1.1 };

/** Stored CSS text sizes and DOCX paragraph spacing meet the shell in pixels. */
export function richDocFontSizePx(value: unknown, headingLevel?: number): number {
  const raw = String(value ?? "").trim();
  const size = Number.parseFloat(raw);
  const inherited = 14 * (HEADING_FONT_SCALE[headingLevel ?? 0] ?? 1);
  if (!Number.isFinite(size) || size <= 0) return inherited;
  if (/pt$/i.test(raw)) return size * 4 / 3;
  if (/rem$/i.test(raw)) {
    const root = typeof document !== "undefined" && typeof getComputedStyle === "function"
      ? Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      : 16;
    return size * root;
  }
  if (/em$/i.test(raw)) return size * inherited;
  if (/%$/.test(raw)) return size * inherited / 100;
  return size;
}

export function richDocLineHeightPx(value: unknown, fontSize: number, headingLevel?: number): number {
  const parsed = parseRichDocLineHeight(value);
  if (parsed?.mode === "exact") return parsed.value * 4 / 3;
  return fontSize * (parsed?.value ?? (headingLevel === 1 ? 1.3 : headingLevel === 2 ? 1.35 : 1.75));
}

/** Exact paragraph heights remain pt in the model and the DOCX exporter. */
export function richDocLineHeightFromPx(value: number): string | null {
  return Number.isFinite(value) && value > 0
    ? `${Math.min(1000, value * 3 / 4)}pt`
    : null;
}
