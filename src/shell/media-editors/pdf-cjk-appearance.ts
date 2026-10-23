"use client";

/**
 * 「加文字」里的中日韩文字要存得下、重开看得见（10-23 R3 实测）。
 *
 * PDFium（EmbedPDF 2.15）给 FreeText 生成外观流时只用 /DA 里的标准字体（Helv）。
 * 标准 14 字体编码不了汉字，生成出来的外观流是**空的**（实测 `/GS gs ` 一行），于是
 * /Contents 里明明有「Zhang San 张三」，重开后画面上什么都没有；拉丁字母单独写时正常。
 *
 * 这里在导出字节时补一条标准外观流：用不嵌入的预定义 CJK 字体（Type0 + CIDFontType0，
 * `STSong-Light` / `KozMinPro-Regular` / `HYSMyeongJo-Medium`，UCS-2 预定义 CMap）。
 * 这是 PDF 规范里的标准做法，Acrobat / Preview / Chrome 都认；PDFium 自己画时经
 * FPDF_SYSFONTINFO 按字符集要回退字体（同源 `/pdfium-fonts/`）。/Contents、/DA 不动，
 * 所以之后在编辑器里再改这条批注照常。
 *
 * 只动「内容里有拉丁 1 以外字符」的 FreeText；别的批注、别的字节原样。
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString, type PDFRef } from "pdf-lib";

/** 有任何一个字符落在拉丁 1 之外（标准字体编码不了）。 */
export function needsCjkAppearance(text: string): boolean {
  for (const char of text) if ((char.codePointAt(0) ?? 0) > 0xff) return true;
  return false;
}

type Script = "gb" | "jp" | "kr";

export function pdfCjkScript(text: string): Script {
  if (/[가-힯ᄀ-ᇿ㄰-㆏]/.test(text)) return "kr";
  if (/[぀-ヿ]/.test(text)) return "jp";
  return "gb";
}

const FONTS: Record<Script, { base: string; ordering: string; supplement: number; cmap: string; asciiCids: [number, number] }> = {
  gb: { base: "STSong-Light", ordering: "GB1", supplement: 4, cmap: "UniGB-UCS2-H", asciiCids: [1, 95] },
  jp: { base: "KozMinPro-Regular", ordering: "Japan1", supplement: 4, cmap: "UniJIS-UCS2-H", asciiCids: [1, 95] },
  kr: { base: "HYSMyeongJo-Medium", ordering: "Korea1", supplement: 1, cmap: "UniKS-UCS2-H", asciiCids: [1, 95] },
};

/** 半角按 0.5em、其余按 1em 估宽（不嵌字体，没有逐字宽度表）。 */
function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 0.5 : 1;
}

/** 按框宽折行（保留原有换行）。 */
export function layoutCjkLines(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    let line = "";
    let width = 0;
    for (const char of paragraph) {
      const w = charWidth(char) * fontSize;
      if (line && width + w > maxWidth) {
        lines.push(line);
        line = "";
        width = 0;
      }
      line += char;
      width += w;
    }
    lines.push(line);
  }
  return lines;
}

/** UCS-2 大端十六进制（BMP 以外的字写成「?」，预定义 CMap 只到 UCS-2）。 */
export function ucs2Hex(text: string): string {
  let hex = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0x3f;
    hex += (code > 0xffff ? 0x3f : code).toString(16).padStart(4, "0").toUpperCase();
  }
  return hex;
}

function parseDa(da: string): { size: number; color: string } {
  const size = Number(/([\d.]+)\s+Tf/.exec(da)?.[1]) || 12;
  const rgb = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da);
  const gray = /([\d.]+)\s+g(?:\s|$)/.exec(da);
  const color = rgb ? `${rgb[1]} ${rgb[2]} ${rgb[3]} rg` : gray ? `${gray[1]} g` : "0 g";
  return { size, color };
}

function numbers(array: PDFArray | undefined): number[] {
  if (!array) return [];
  return array.asArray().map((value) => (value instanceof PDFNumber ? value.asNumber() : Number.NaN));
}

/** 一条 FreeText 的外观流内容（纯函数，测试直接断言）。 */
export function cjkAppearanceContent(input: {
  text: string;
  rect: [number, number, number, number];
  da: string;
  align: number;
  background?: number[];
}): string {
  const [x1, y1, x2, y2] = input.rect;
  const { size, color } = parseDa(input.da);
  const pad = 2;
  const width = Math.max(0, x2 - x1 - pad * 2);
  const leading = size * 1.2;
  const lines = layoutCjkLines(input.text, size, width || size * 20);
  const ops: string[] = ["/Tx BMC", "q"];
  const bg = input.background;
  if (bg && bg.length === 3 && bg.every(Number.isFinite)) {
    ops.push(`${bg[0]} ${bg[1]} ${bg[2]} rg`, `${x1} ${y1} ${x2 - x1} ${y2 - y1} re f`);
  }
  ops.push("BT", color, `/FCJK ${size} Tf`);
  let y = y2 - pad - size * 0.88;
  for (const line of lines) {
    const lineWidth = [...line].reduce((sum, char) => sum + charWidth(char) * size, 0);
    const x =
      input.align === 1
        ? x1 + pad + Math.max(0, (width - lineWidth) / 2)
        : input.align === 2
          ? x1 + pad + Math.max(0, width - lineWidth)
          : x1 + pad;
    ops.push(`1 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Tm`, `<${ucs2Hex(line)}> Tj`);
    y -= leading;
  }
  ops.push("ET", "Q", "EMC");
  return ops.join("\n");
}

function decoded(value: unknown): string {
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : "";
}

/**
 * 给内容里有中日韩文字的 FreeText 补外观流。没有要补的就原样返回（不重写字节）。
 */
export async function fixPdfCjkFreeTextAppearances(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; fixed: number }> {
  const document = await PDFDocument.load(Uint8Array.from(bytes), { updateMetadata: false });
  const context = document.context;
  const fontRefs = new Map<Script, PDFRef>();
  const fontFor = (script: Script): PDFRef => {
    const known = fontRefs.get(script);
    if (known) return known;
    const spec = FONTS[script];
    const descriptor = context.register(
      context.obj({
        Type: "FontDescriptor",
        FontName: spec.base,
        Flags: 6,
        FontBBox: [-25, -254, 1000, 880],
        ItalicAngle: 0,
        Ascent: 880,
        Descent: -120,
        CapHeight: 880,
        StemV: 93,
      }),
    );
    const descendant = context.register(
      context.obj({
        Type: "Font",
        Subtype: "CIDFontType0",
        BaseFont: spec.base,
        CIDSystemInfo: {
          Registry: PDFString.of("Adobe"),
          Ordering: PDFString.of(spec.ordering),
          Supplement: spec.supplement,
        },
        FontDescriptor: descriptor,
        DW: 1000,
        W: [spec.asciiCids[0], spec.asciiCids[1], 500],
      }),
    );
    const font = context.register(
      context.obj({
        Type: "Font",
        Subtype: "Type0",
        BaseFont: `${spec.base}-${spec.cmap}`,
        Encoding: spec.cmap,
        DescendantFonts: [descendant],
      }),
    );
    fontRefs.set(script, font);
    return font;
  };
  let fixed = 0;
  for (const page of document.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let index = 0; index < annots.size(); index += 1) {
      const annot = annots.lookupMaybe(index, PDFDict);
      if (!annot || annot.lookup(PDFName.of("Subtype"))?.toString() !== "/FreeText") continue;
      const text = decoded(annot.lookup(PDFName.of("Contents")));
      if (!text || !needsCjkAppearance(text)) continue;
      const rect = numbers(annot.lookupMaybe(PDFName.of("Rect"), PDFArray));
      if (rect.length !== 4 || !rect.every(Number.isFinite)) continue;
      const [x1, y1, x2, y2] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])];
      const da = decoded(annot.lookup(PDFName.of("DA"))) || "0 g /Helv 12 Tf";
      const align = (annot.lookup(PDFName.of("Q")) as PDFNumber | undefined)?.asNumber?.() ?? 0;
      const background = numbers(annot.lookupMaybe(PDFName.of("C"), PDFArray));
      const content = cjkAppearanceContent({
        text,
        rect: [x1, y1, x2, y2],
        da,
        align,
        background: background.length === 3 ? background : undefined,
      });
      const stream = context.flateStream(content, {
        Type: "XObject",
        Subtype: "Form",
        FormType: 1,
        BBox: [x1, y1, x2, y2],
        Matrix: [1, 0, 0, 1, 0, 0],
        Resources: { Font: { FCJK: fontFor(pdfCjkScript(text)) } },
      });
      annot.set(PDFName.of("AP"), context.obj({ N: context.register(stream) }));
      fixed += 1;
    }
  }
  if (!fixed) return { bytes, fixed };
  return { bytes: await document.save({ useObjectStreams: true }), fixed };
}
