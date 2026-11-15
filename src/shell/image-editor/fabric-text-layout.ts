/** Text stays editable source data. Lists/indent/vertical layout never rewrite it. */
import type { IText } from "fabric";
import type { FabricNS } from "./editor-objects";

export interface FabricTextLayoutProps {
  oceanleoList?: "none" | "bullet" | "ordered";
  oceanleoIndent?: number;
  oceanleoVerticalText?: boolean;
  /** Horizontal layout width, also the available column length in vertical mode. */
  oceanleoTextWidth?: number;
}
export const FABRIC_TEXT_LAYOUT_PROPS = ["oceanleoList", "oceanleoIndent", "oceanleoVerticalText", "oceanleoTextWidth"];
type LayoutText = IText & FabricTextLayoutProps & {
  _styleMap?: Record<number, { line: number; offset: number }>;
};
const installed = new WeakSet<object>();
const measuring = new WeakSet<object>();
const xml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const enabled = (text: LayoutText) => Boolean(text.oceanleoVerticalText || text.oceanleoIndent || (text.oceanleoList && text.oceanleoList !== "none"));
export const fabricTextIndent = (text: FabricTextLayoutProps) => Math.max(0, Math.min(240, Number(text.oceanleoIndent) || 0));
function gutter(text: LayoutText): number {
  const list = text.oceanleoList && text.oceanleoList !== "none";
  return fabricTextIndent(text) + (list ? text.fontSize * Math.max(1.4, (String(text.text.split("\n").length).length + 1) * 0.7) : 0);
}
function markers(text: LayoutText): Array<{ line: number; value: string }> {
  if (!text.oceanleoList || text.oceanleoList === "none") return [];
  let ordinal = 0;
  const source = text.text.split("\n");
  return text._textLines.flatMap((_line, index) => {
    const map = text._styleMap?.[index] || { line: index, offset: 0 };
    if (map.offset || !source[map.line]?.trim()) return [];
    ordinal += 1;
    return [{ line: index, value: text.oceanleoList === "bullet" ? "•" : `${ordinal}.` }];
  });
}
interface Glyph { line: number; char: number; value: string; x: number; y: number; size: number }
function verticalGlyphs(text: LayoutText): Glyph[] {
  let x = text.width / 2;
  const result: Glyph[] = [];
  const markerByLine = new Map(markers(text).map(marker => [marker.line, marker.value]));
  text._textLines.forEach((line, lineIndex) => {
    const lineWidth = text.getHeightOfLine(lineIndex);
    x -= lineWidth;
    let y = -text.height / 2 + gutter(text);
    const advance = line.map((_value, char) => {
      const style = text.getCompleteStyleDeclaration(lineIndex, char);
      return Number(style.fontSize || text.fontSize) + text.charSpacing * text.fontSize / 1000;
    });
    const length = advance.reduce((sum, value) => sum + value, 0);
    const spare = Math.max(0, text.height - gutter(text) - length);
    y += text.textAlign === "center" ? spare / 2 : text.textAlign === "right" ? spare : 0;
    const marker = markerByLine.get(lineIndex);
    if (marker) result.push({ line: lineIndex, char: 0, value: marker, x, y: -text.height / 2 + fabricTextIndent(text) + text.fontSize, size: text.fontSize });
    line.forEach((value, char) => {
      const size = Number(text.getCompleteStyleDeclaration(lineIndex, char).fontSize || text.fontSize);
      result.push({ line: lineIndex, char, value, x, y: y + size, size });
      y += advance[char];
    });
  });
  return result;
}
function glyphStyle(text: LayoutText, glyph: Glyph) {
  return text.getCompleteStyleDeclaration(glyph.line, glyph.char);
}
function verticalSvg(text: LayoutText): string {
  return '<g>' + verticalGlyphs(text).map(glyph => {
    const style = glyphStyle(text, glyph);
    const color = typeof style.fill === "string" ? style.fill : text.fill;
    const background = typeof style.textBackgroundColor === "string" ? style.textBackgroundColor : "";
    const decoration = [style.underline ? "underline" : "", style.linethrough ? "line-through" : "", style.overline ? "overline" : ""].filter(Boolean).join(" ");
    return (background ? `<rect x="${glyph.x}" y="${glyph.y - glyph.size}" width="${glyph.size}" height="${glyph.size}" fill="${xml(background)}"/>` : "") +
      `<text x="${glyph.x}" y="${glyph.y}" font-family="${xml(style.fontFamily)}" font-size="${glyph.size}" font-weight="${xml(style.fontWeight)}" font-style="${xml(style.fontStyle)}" fill="${xml(color)}" stroke="${xml(style.stroke || "none")}" stroke-width="${Number(style.strokeWidth) || 0}" text-decoration="${decoration}">${xml(glyph.value)}</text>`;
  }).join("") + '</g>';
}
function markerSvg(text: LayoutText): string {
  return markers(text).map(marker => {
    let top = -text.height / 2;
    for (let index = 0; index < marker.line; index++) top += text.getHeightOfLine(index);
    const y = top + text.getHeightOfLine(marker.line) / text.lineHeight * (1 - text._fontSizeFraction);
    return `<text x="${-text.width / 2 + fabricTextIndent(text)}" y="${y}" font-family="${xml(text.fontFamily)}" font-size="${text.fontSize}" fill="${xml(typeof text.fill === "string" ? text.fill : "#1c1917")}">${xml(marker.value)}</text>`;
  }).join("");
}
function cleanCharacterStyle(style: unknown): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  if (!style || typeof style !== "object") return clean;
  for (const [key, value] of Object.entries(style)) {
    if (["fontFamily", "fontStyle", "fontWeight", "fill", "stroke", "textBackgroundColor"].includes(key) && typeof value === "string" && value.length < 400 && !/[<>]|url\s*\(/i.test(value)) clean[key] = value;
    if (["fontSize", "strokeWidth", "deltaY", "fontWeight"].includes(key) && typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1000) clean[key] = value;
    if (["underline", "overline", "linethrough"].includes(key) && typeof value === "boolean") clean[key] = value;
  }
  return clean;
}

/** Typed, bounded text-only metadata; never enliven arbitrary SVG-provided classes. */
export function decodeFabricTextMetadata(value: string): Record<string, unknown> | null {
  if (value.length > 200_000 || !/^[A-Za-z0-9+/=]+$/.test(value)) return null;
  try {
    const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    if (!raw || !["IText", "Textbox", "i-text", "textbox"].includes(raw.type) || typeof raw.text !== "string" || raw.text.length > 2000) return null;
    const result: Record<string, unknown> = { type: raw.type, text: raw.text };
    for (const key of ["left", "top", "width", "height", "scaleX", "scaleY", "angle", "skewX", "skewY", "fontSize", "charSpacing", "lineHeight", "strokeWidth", "opacity", "oceanleoIndent", "oceanleoTextWidth"]) {
      if (typeof raw[key] === "number" && Number.isFinite(raw[key])) result[key] = Math.max(-100000, Math.min(100000, raw[key]));
    }
    for (const key of ["fontFamily", "fontStyle", "fontWeight", "fill", "stroke", "textAlign", "textBackgroundColor", "backgroundColor", "originX", "originY"]) {
      if (typeof raw[key] === "string" && raw[key].length < 400 && !/[<>]/.test(raw[key])) result[key] = raw[key];
    }
    for (const key of ["underline", "overline", "linethrough", "flipX", "flipY", "oceanleoVerticalText"]) if (typeof raw[key] === "boolean") result[key] = raw[key];
    if (typeof raw.fontWeight === "number" && raw.fontWeight >= 100 && raw.fontWeight <= 1000) result.fontWeight = raw.fontWeight;
    if (Array.isArray(raw.oceanleoSvgMatrix) && raw.oceanleoSvgMatrix.length === 6 && raw.oceanleoSvgMatrix.every((value: unknown) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 100000)) result.oceanleoSvgMatrix = raw.oceanleoSvgMatrix;
    if (Array.isArray(raw.styles)) {
      result.styles = raw.styles.slice(0, 2000).filter((run: { start?: unknown; end?: unknown }) =>
        Number.isInteger(run.start) && Number.isInteger(run.end) && Number(run.start) >= 0 && Number(run.end) > Number(run.start) && Number(run.end) <= 4000,
      ).map((run: { start: number; end: number; style: unknown }) => ({ start: run.start, end: run.end, style: cleanCharacterStyle(run.style) }));
    } else if (raw.styles && typeof raw.styles === "object") {
      const styles: Record<string, Record<string, Record<string, unknown>>> = {};
      for (const [line, chars] of Object.entries(raw.styles)) {
        if (!/^\d{1,4}$/.test(line) || !chars || typeof chars !== "object") continue;
        const row: Record<string, Record<string, unknown>> = {};
        for (const [index, style] of Object.entries(chars)) {
          if (!/^\d{1,4}$/.test(index) || !style || typeof style !== "object") continue;
          row[index] = cleanCharacterStyle(style);
        }
        styles[line] = row;
      }
      result.styles = styles;
    }
    result.oceanleoList = raw.oceanleoList === "bullet" || raw.oceanleoList === "ordered" ? raw.oceanleoList : "none";
    return result;
  } catch { return null; }
}
function metadata(text: LayoutText): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...text.toObject(), oceanleoSvgMatrix: text.calcTransformMatrix() }));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
}

/** Install once on the dynamically imported engine, covering both new and restored IText/Textbox. */
export function installFabricTextLayout(fabric: FabricNS): void {
  if (installed.has(fabric.IText)) return;
  installed.add(fabric.IText);
  fabric.FabricObject.customProperties = [...new Set([...fabric.FabricObject.customProperties, ...FABRIC_TEXT_LAYOUT_PROPS])];
  for (const prototype of [fabric.IText.prototype, fabric.Textbox.prototype]) {
    const original = prototype.initDimensions;
    prototype.initDimensions = function(this: LayoutText) {
      if (measuring.has(this) || !enabled(this)) { original.call(this); return; }
      measuring.add(this);
      const vertical = this.oceanleoVerticalText && !this.isEditing;
      const horizontalWidth = this.oceanleoTextWidth || this.width;
      const isBox = this instanceof fabric.Textbox;
      const inset = gutter(this);
      if (isBox) this.width = Math.max(this.fontSize, horizontalWidth - inset);
      try {
        original.call(this);
        this.width += inset;
        if (vertical) {
          this.oceanleoTextWidth = horizontalWidth;
          const columnHeight = Math.max(this.fontSize, ...this._textLines.map((line, index) => line.reduce((sum, _char, char) => sum + Number(this.getCompleteStyleDeclaration(index, char).fontSize || this.fontSize) + this.charSpacing * this.fontSize / 1000, 0))) + inset;
          this.width = this._textLines.reduce((sum, _line, index) => sum + this.getHeightOfLine(index), 0);
          this.height = columnHeight;
        }
      } finally { measuring.delete(this); }
    };
  }
  const prototype = fabric.IText.prototype;
  const offset = prototype._getLineLeftOffset;
  prototype._getLineLeftOffset = function(this: LayoutText, line: number) {
    if (!enabled(this) || this.oceanleoVerticalText && !this.isEditing) return offset.call(this, line);
    const inset = gutter(this);
    this.width -= inset;
    try { return offset.call(this, line) + inset; } finally { this.width += inset; }
  };
  const render = prototype._render;
  prototype._render = function(this: LayoutText, ctx: CanvasRenderingContext2D) {
    if (!this.oceanleoVerticalText || this.isEditing) {
      render.call(this, ctx);
      if (this.oceanleoList && this.oceanleoList !== "none") {
        ctx.save(); this._setTextStyles(ctx); ctx.fillStyle = typeof this.fill === "string" ? this.fill : "#1c1917";
        for (const marker of markers(this)) {
          let y = -this.height / 2 + this.getHeightOfLine(marker.line) / this.lineHeight * (1 - this._fontSizeFraction);
          for (let index = 0; index < marker.line; index++) y += this.getHeightOfLine(index);
          ctx.fillText(marker.value, -this.width / 2 + fabricTextIndent(this), y);
        }
        ctx.restore();
      }
      return;
    }
    ctx.save();
    for (const glyph of verticalGlyphs(this)) {
      const style = glyphStyle(this, glyph);
      if (style.textBackgroundColor) { ctx.fillStyle = style.textBackgroundColor; ctx.fillRect(glyph.x, glyph.y - glyph.size, glyph.size, glyph.size); }
      this._renderChar("fillText", ctx, glyph.line, glyph.char, glyph.value, glyph.x, glyph.y);
      if (style.stroke && style.strokeWidth) this._renderChar("strokeText", ctx, glyph.line, glyph.char, glyph.value, glyph.x, glyph.y);
      if (style.underline || style.linethrough || style.overline) {
        ctx.fillStyle = typeof style.fill === "string" ? style.fill : "#1c1917";
        for (const x of [style.underline ? glyph.x + glyph.size : null, style.linethrough ? glyph.x + glyph.size / 2 : null, style.overline ? glyph.x : null]) if (x !== null) ctx.fillRect(x, glyph.y - glyph.size, Math.max(1, glyph.size / 16), glyph.size);
      }
    }
    ctx.restore();
  };
  const svg = prototype._toSVG;
  prototype._toSVG = function(this: LayoutText) {
    if (!enabled(this)) return svg.call(this);
    const rendered = this.oceanleoVerticalText ? verticalSvg(this) : svg.call(this).join("") + markerSvg(this);
    return [`<g data-oceanleo-text="${metadata(this)}">`, rendered, '</g>'];
  };
  // Native editing retains its exact character/IME/cursor model. Reflow the stored
  // vertical text horizontally during editing, then restore the column layout.
  const enter = prototype.enterEditing;
  prototype.enterEditing = function(this: LayoutText, event) { enter.call(this, event); if (this.oceanleoVerticalText) { this.initDimensions(); this.setCoords(); } };
  const exit = prototype.exitEditing;
  prototype.exitEditing = function(this: LayoutText) { const result = exit.call(this); if (this.oceanleoVerticalText) { this.initDimensions(); this.setCoords(); } return result; };
}
