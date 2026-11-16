import type { FabricText, Textbox } from "fabric";
import type { FabricNS } from "./editor-objects";
import type { FabricTextLayoutProps } from "./fabric-text-layout";

const installed = new WeakSet<object>();

/** Fabric sums isolated glyph/kerning pairs, while Canvas paints whole runs.
 * Noto's contextual substitutions (e.g. serif digits in a date) can therefore
 * paint narrower than the editable box, even with the correct font loaded.
 */
export function installFabricFontShaping(fabric: FabricNS): void {
  if (!fabric.FabricText || installed.has(fabric.FabricText)) return;
  installed.add(fabric.FabricText);
  let context: CanvasRenderingContext2D | null = null;
  const prototype = fabric.FabricText.prototype;
  const measure = prototype._measureLine;
  prototype._measureLine = function(this: FabricText & FabricTextLayoutProps, lineIndex: number) {
    const result = measure.call(this, lineIndex);
    // These modes render separate runs/glyphs or use our vertical layout.
    if (!/\bNoto (?:Sans|Serif)\b/.test(this.fontFamily) || this.path || this.charSpacing ||
        this.oceanleoVerticalText || this.textAlign.includes("justify") || !this.isEmptyStyles(lineIndex) || result.width <= 0) return result;
    context ??= fabric.util.createCanvasElement().getContext("2d");
    const line = this._textLines[lineIndex];
    if (!context || !line?.length) return result;
    this._setTextStyles(context, undefined, true);
    context.direction = this.direction;
    const width = context.measureText(line.join("")).width * this.fontSize / this.CACHE_FONT_SIZE;
    if (!Number.isFinite(width) || width <= 0 || Math.abs(width - result.width) < 0.0001) return result;
    // Keep selection/caret bounds inside the corrected frame in linear time.
    // Prefix reshaping would be quadratic for large imported SVG text lines.
    const ratio = width / result.width;
    for (const box of this.__charBounds[lineIndex]) {
      box.left *= ratio; box.width *= ratio; box.kernedWidth *= ratio;
    }
    return { ...result, width };
  };
  const textbox = fabric.Textbox?.prototype;
  if (!textbox) return;
  const measureWord = textbox._measureWord;
  textbox._measureWord = function(this: Textbox & FabricTextLayoutProps, word: string[], lineIndex: number, charOffset?: number) {
    const original = measureWord.call(this, word, lineIndex, charOffset);
    if (!/\bNoto (?:Sans|Serif)\b/.test(this.fontFamily) || this.charSpacing ||
        this.oceanleoVerticalText || !fabric.FabricText.prototype.isEmptyStyles.call(this, lineIndex)) return original;
    context ??= fabric.util.createCanvasElement().getContext("2d");
    if (!context) return original;
    this._setTextStyles(context, undefined, true);
    context.direction = this.direction;
    const width = context.measureText(word.join("")).width * this.fontSize / this.CACHE_FONT_SIZE;
    return Number.isFinite(width) && width >= 0 ? width : original;
  };

}
