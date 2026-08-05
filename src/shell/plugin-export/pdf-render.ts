/**
 * 把一份导出载荷渲成 PDF —— **中文是真的能看见的那种**。
 *
 * 手写 PDF 只能用 WinAnsi 的十四款标准字体，中文一律渲成空白方块，所以这里
 * 自带字形：拉丁走 Liberation Sans（OFL 1.1）、汉字走 Droid Sans Fallback
 * （Apache 2.0），两份都**按本份文档实际用到的字符现切一次子集**再嵌进文件。
 * 一份三十行的台账因此只带几十个字形，PDF 通常在 40 KB 上下，而不是几兆。
 *
 * 文字是**可选中、可检索的真文字**，不是图片：每一份嵌入字体都带 ToUnicode
 * CMap，PDF 阅读器复制出来的就是原文。这一点是选「随包带字形子集」而不是
 * 「长图转图像页」的全部理由。
 *
 * 同一份输入必须产出同一串字节：不读当前时间（只用请求里的 `exportedAt`）、
 * 不带 `/ID`、压缩用固定参数、子集按码位升序切。幂等键因此稳定。
 */

import { strToU8, zlibSync } from "fflate";

import type { PdfFontSet } from "./pdf-cjk-font";
import type {
  NormalizedPluginExportRequest,
  PluginExportCell,
} from "./plugin-export-contract";
import { subsetTrueType, type TrueTypeSubset } from "./truetype-subset";

/* ------------------------------ 版式常量 -------------------------------- */

/** A4，单位是 PDF 点（1/72 英寸）。 */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const TITLE_SIZE = 18;
const META_SIZE = 9;
const HEAD_SIZE = 9;
const CELL_SIZE = 9;
const TOTAL_SIZE = 10;
const NOTE_SIZE = 8.5;
const FOOTER_SIZE = 8;

const ROW_HEIGHT = 17;
const HEAD_HEIGHT = 20;
const CELL_PADDING = 6;

const INK = "#1c1917";
const MUTED = "#78716c";
const FAINT = "#a8a29e";
const HEAD_FILL = "#f5f5f4";
const STRIPE_FILL = "#fafaf9";
const RULE = "#e7e5e4";

/** 集外字符用它顶上；随包字集把它锁成必备字形，切不出来时构建期就红。 */
const REPLACEMENT = 0x25a1;
const ELLIPSIS = 0x2026;

type FontKey = "latin" | "cjk";

interface TextRun {
  fontKey: FontKey;
  codePoints: number[];
  x: number;
  y: number;
  size: number;
  color: string;
}

interface RectOp {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface PageOps {
  rects: RectOp[];
  runs: TextRun[];
}

interface ResolvedChar {
  fontKey: FontKey;
  codePoint: number;
  /** 千分之一 em 的步进宽度。 */
  advance: number;
  substituted: boolean;
}

/* ------------------------------ 取字与量宽 ------------------------------ */

class TextEngine {
  private readonly cache = new Map<number, ResolvedChar>();
  /** 集外字符按码位计数，页脚要把它明写出来。 */
  readonly substituted = new Map<number, number>();
  readonly used: Record<FontKey, Set<number>> = {
    latin: new Set(),
    cjk: new Set(),
  };

  private readonly fonts: PdfFontSet;

  constructor(fonts: PdfFontSet) {
    this.fonts = fonts;
  }

  /** 查字顺序与构建期分派子集时**是同一条**：先拉丁，再中日韩。 */
  resolve(codePoint: number): ResolvedChar {
    const cached = this.cache.get(codePoint);
    if (cached) {
      this.used[cached.fontKey].add(cached.codePoint);
      return cached;
    }
    let resolved: ResolvedChar | null = null;
    for (const key of ["latin", "cjk"] as const) {
      const { font } = this.fonts[key];
      const gid = font.glyphId(codePoint);
      if (!gid) continue;
      resolved = {
        fontKey: key,
        codePoint,
        advance: (font.advance(gid) * 1000) / font.unitsPerEm,
        substituted: false,
      };
      break;
    }
    if (!resolved) {
      const marker = this.resolve(REPLACEMENT);
      resolved = { ...marker, substituted: true };
      this.substituted.set(
        codePoint,
        (this.substituted.get(codePoint) || 0) + 1,
      );
    }
    this.cache.set(codePoint, resolved);
    this.used[resolved.fontKey].add(resolved.codePoint);
    return resolved;
  }

  width(text: string, size: number): number {
    let total = 0;
    for (const character of text) {
      total += this.resolve(character.codePointAt(0)!).advance;
    }
    return (total * size) / 1000;
  }

  /** 一行放不下就截断并加省略号。长图渲染器按字数截，这里按真实宽度截。 */
  truncate(text: string, size: number, maxWidth: number): string {
    if (this.width(text, size) <= maxWidth) return text;
    const ellipsisWidth = (this.resolve(ELLIPSIS).advance * size) / 1000;
    let kept = "";
    let width = 0;
    for (const character of text) {
      const advance =
        (this.resolve(character.codePointAt(0)!).advance * size) / 1000;
      if (width + advance + ellipsisWidth > maxWidth) break;
      kept += character;
      width += advance;
    }
    return `${kept}…`;
  }

  /** 按宽度折行。中文可以任意断，连续拉丁词尽量不拦腰断。 */
  wrap(text: string, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = "";
    let width = 0;
    let wordStart = -1;
    for (const character of text) {
      const codePoint = character.codePointAt(0)!;
      const advance = (this.resolve(codePoint).advance * size) / 1000;
      const isWordChar =
        (codePoint >= 0x30 && codePoint <= 0x39) ||
        (codePoint >= 0x41 && codePoint <= 0x5a) ||
        (codePoint >= 0x61 && codePoint <= 0x7a);
      if (width + advance > maxWidth && line) {
        if (isWordChar && wordStart > 0) {
          lines.push(line.slice(0, wordStart));
          line = line.slice(wordStart);
          width = this.width(line, size);
        } else {
          lines.push(line);
          line = "";
          width = 0;
        }
        wordStart = -1;
      }
      if (!isWordChar) wordStart = line.length + character.length;
      line += character;
      width += advance;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }
}

/* -------------------------------- 排版 ---------------------------------- */

function cellText(cell: PluginExportCell): string {
  return cell === null || cell === undefined ? "" : String(cell);
}

/** 控制字符会把内容流写坏，也不该出现在成品里。 */
function sanitize(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, " ");
}

function isNumericCell(cell: PluginExportCell): boolean {
  return typeof cell === "number" && Number.isFinite(cell);
}

class PdfPageWriter {
  readonly pages: PageOps[] = [];
  private current: PageOps = { rects: [], runs: [] };
  /** 当前基线所在的 y（PDF 坐标系原点在左下角）。 */
  cursor = PAGE_HEIGHT - MARGIN;
  private readonly engine: TextEngine;

  constructor(engine: TextEngine) {
    this.engine = engine;
    this.pages.push(this.current);
  }

  newPage(): void {
    this.current = { rects: [], runs: [] };
    this.pages.push(this.current);
    this.cursor = PAGE_HEIGHT - MARGIN;
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    this.current.rects.push({ x, y, width, height, color });
  }

  /**
   * 一行文字。一行里同时有中英文时按字体切成多段，各段自己算起点——
   * 这是「一份 PDF 里嵌两份字体」的必然结果，也是它能既有中文又有数字的原因。
   */
  text(
    raw: string,
    x: number,
    baseline: number,
    size: number,
    color: string,
    align: "left" | "right" = "left",
  ): void {
    const text = sanitize(raw);
    if (!text) return;
    let cursorX = x;
    if (align === "right") cursorX = x - this.engine.width(text, size);
    let run: TextRun | null = null;
    for (const character of text) {
      const resolved = this.engine.resolve(character.codePointAt(0)!);
      if (!run || run.fontKey !== resolved.fontKey) {
        run = {
          fontKey: resolved.fontKey,
          codePoints: [],
          x: cursorX,
          y: baseline,
          size,
          color,
        };
        this.current.runs.push(run);
      }
      run.codePoints.push(resolved.codePoint);
      cursorX += (resolved.advance * size) / 1000;
    }
  }
}

interface ColumnLayout {
  label: string;
  x: number;
  width: number;
  numeric: boolean;
}

function layoutColumns(
  engine: TextEngine,
  request: NormalizedPluginExportRequest,
): ColumnLayout[] {
  const { columns, rows } = request.data;
  const natural = columns.map((column, index) => {
    let width = engine.width(sanitize(column.label), HEAD_SIZE);
    for (const row of rows) {
      const text = sanitize(cellText(row[index] ?? null));
      // 超长单元格不参与列宽竞价，否则一条备注能把整张表挤扁。
      width = Math.max(width, Math.min(engine.width(text, CELL_SIZE), 160));
    }
    return width + CELL_PADDING * 2;
  });
  const total = natural.reduce((sum, value) => sum + value, 0) || 1;
  const scale = CONTENT_WIDTH / total;
  const layout: ColumnLayout[] = [];
  let x = MARGIN;
  columns.forEach((column, index) => {
    const width = natural[index] * scale;
    const numeric =
      column.type === "number" ||
      column.type === "currency" ||
      rows.every((row) => row[index] === null || isNumericCell(row[index]));
    layout.push({ label: sanitize(column.label), x, width, numeric });
    x += width;
  });
  return layout;
}

function drawTableHeader(
  writer: PdfPageWriter,
  engine: TextEngine,
  columns: ColumnLayout[],
): void {
  const top = writer.cursor;
  writer.rect(MARGIN, top - HEAD_HEIGHT, CONTENT_WIDTH, HEAD_HEIGHT, HEAD_FILL);
  for (const column of columns) {
    const inner = column.width - CELL_PADDING * 2;
    const label = engine.truncate(column.label, HEAD_SIZE, inner);
    if (column.numeric) {
      writer.text(
        label,
        column.x + column.width - CELL_PADDING,
        top - HEAD_HEIGHT + 6,
        HEAD_SIZE,
        MUTED,
        "right",
      );
    } else {
      writer.text(
        label,
        column.x + CELL_PADDING,
        top - HEAD_HEIGHT + 6,
        HEAD_SIZE,
        MUTED,
      );
    }
  }
  writer.cursor = top - HEAD_HEIGHT;
}

/* ------------------------------ PDF 序列化 ------------------------------ */

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function colorOperator(hex: string): string {
  const value = hex.replace("#", "");
  const channel = (start: number) =>
    formatNumber(parseInt(value.slice(start, start + 2), 16) / 255);
  return `${channel(0)} ${channel(2)} ${channel(4)} rg`;
}

function hexGlyphs(codePoints: number[], subset: TrueTypeSubset): string {
  let out = "";
  for (const codePoint of codePoints) {
    const gid = subset.glyphIdForCodePoint.get(codePoint) || 0;
    out += gid.toString(16).padStart(4, "0").toUpperCase();
  }
  return out;
}

function contentStream(
  page: PageOps,
  subsets: Record<FontKey, TrueTypeSubset>,
  fontName: Record<FontKey, string>,
): string {
  const parts: string[] = [];
  let color = "";
  for (const rect of page.rects) {
    const operator = colorOperator(rect.color);
    if (operator !== color) {
      parts.push(operator);
      color = operator;
    }
    parts.push(
      `${formatNumber(rect.x)} ${formatNumber(rect.y)} ${formatNumber(
        rect.width,
      )} ${formatNumber(rect.height)} re f`,
    );
  }
  for (const run of page.runs) {
    if (!run.codePoints.length) continue;
    parts.push("BT");
    parts.push(`/${fontName[run.fontKey]} ${formatNumber(run.size)} Tf`);
    parts.push(colorOperator(run.color));
    parts.push(
      `1 0 0 1 ${formatNumber(run.x)} ${formatNumber(run.y)} Tm`,
    );
    parts.push(`<${hexGlyphs(run.codePoints, subsets[run.fontKey])}> Tj`);
    parts.push("ET");
    color = "";
  }
  return parts.join("\n");
}

function toUnicodeCMap(subset: TrueTypeSubset): string {
  const entries = [...subset.glyphIdForCodePoint]
    .map(([codePoint, gid]) => [gid, codePoint] as const)
    .sort((a, b) => a[0] - b[0]);
  const chunks: string[] = [];
  for (let i = 0; i < entries.length; i += 100) {
    const slice = entries.slice(i, i + 100);
    chunks.push(`${slice.length} beginbfchar`);
    for (const [gid, codePoint] of slice) {
      chunks.push(
        `<${gid.toString(16).padStart(4, "0").toUpperCase()}> <${codePoint
          .toString(16)
          .padStart(4, "0")
          .toUpperCase()}>`,
      );
    }
    chunks.push("endbfchar");
  }
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    ...chunks,
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}

function widthArray(subset: TrueTypeSubset): string {
  const scale = 1000 / subset.unitsPerEm;
  const groups: string[] = [];
  let start = -1;
  let widths: number[] = [];
  const flush = () => {
    if (start < 0) return;
    groups.push(`${start} [${widths.map((w) => Math.round(w)).join(" ")}]`);
    start = -1;
    widths = [];
  };
  for (let gid = 1; gid < subset.advances.length; gid += 1) {
    if (start < 0) start = gid;
    widths.push(subset.advances[gid] * scale);
    if (widths.length >= 64) flush();
  }
  flush();
  return `[${groups.join(" ")}]`;
}

/** 子集前缀必须是六个大写字母，且随内容变化。这里由码位表定，因而是确定的。 */
function subsetTag(subset: TrueTypeSubset): string {
  let hash = 0x811c9dc5;
  for (const codePoint of [...subset.glyphIdForCodePoint.keys()].sort(
    (a, b) => a - b,
  )) {
    hash = ((hash ^ codePoint) * 0x01000193) >>> 0;
  }
  let tag = "";
  for (let i = 0; i < 6; i += 1) {
    tag += String.fromCharCode(65 + (hash % 26));
    hash = Math.floor(hash / 26) + 7;
  }
  return tag;
}

function pdfDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!match) return "D:20260101000000Z";
  return `D:${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}${match[6]}Z`;
}

function pdfLiteral(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * UTF-16BE 的十六进制串。PDF 的文本串默认按 PDFDocEncoding 读，中文标题
 * 不带 BOM 就会在阅读器的属性面板里变成乱码。
 */
function pdfTextString(text: string): string {
  let out = "FEFF";
  for (const character of text) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint > 0xffff) {
      const value = codePoint - 0x10000;
      out += (0xd800 + (value >> 10)).toString(16).padStart(4, "0");
      out += (0xdc00 + (value & 0x3ff)).toString(16).padStart(4, "0");
    } else {
      out += codePoint.toString(16).padStart(4, "0");
    }
  }
  return `<${out.toUpperCase()}>`;
}

class PdfWriter {
  private readonly objects: (Uint8Array | null)[] = [];

  reserve(): number {
    this.objects.push(null);
    return this.objects.length;
  }

  set(id: number, body: string | Uint8Array): void {
    this.objects[id - 1] =
      typeof body === "string" ? strToU8(body) : body;
  }

  add(body: string | Uint8Array): number {
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  stream(dictionary: string, payload: Uint8Array, compress = true): Uint8Array {
    const body = compress ? zlibSync(payload, { level: 9 }) : payload;
    const head = strToU8(
      `<< ${dictionary} /Length ${body.length}${
        compress ? " /Filter /FlateDecode" : ""
      } >>\nstream\n`,
    );
    const tail = strToU8("\nendstream");
    const out = new Uint8Array(head.length + body.length + tail.length);
    out.set(head, 0);
    out.set(body, head.length);
    out.set(tail, head.length + body.length);
    return out;
  }

  build(rootId: number, infoId: number): Uint8Array {
    const header = strToU8("%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n");
    const chunks: Uint8Array[] = [header];
    const offsets: number[] = [];
    let position = header.length;
    this.objects.forEach((body, index) => {
      if (!body) throw new Error(`PDF 对象 ${index + 1} 没有写入内容`);
      const prefix = strToU8(`${index + 1} 0 obj\n`);
      const suffix = strToU8("\nendobj\n");
      offsets.push(position);
      chunks.push(prefix, body, suffix);
      position += prefix.length + body.length + suffix.length;
    });
    const xrefStart = position;
    const xref: string[] = [
      "xref",
      `0 ${this.objects.length + 1}`,
      "0000000000 65535 f ",
    ];
    for (const offset of offsets) {
      xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
    }
    xref.push(
      "trailer",
      `<< /Size ${this.objects.length + 1} /Root ${rootId} 0 R /Info ${infoId} 0 R >>`,
      "startxref",
      String(xrefStart),
      "%%EOF",
      "",
    );
    chunks.push(strToU8(xref.join("\n")));
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const chunk of chunks) {
      out.set(chunk, cursor);
      cursor += chunk.length;
    }
    return out;
  }
}

/* -------------------------------- 入口 ---------------------------------- */

export function renderPdf(
  request: NormalizedPluginExportRequest,
  fonts: PdfFontSet,
): Uint8Array {
  const engine = new TextEngine(fonts);
  const writer = new PdfPageWriter(engine);
  const { data } = request;

  // 抬头：标题 + 一行出处。与网页、长图三种形态同一套信息，不多不少。
  writer.cursor -= TITLE_SIZE;
  writer.text(request.title, MARGIN, writer.cursor, TITLE_SIZE, INK);
  writer.cursor -= 16;
  writer.text(
    `${request.sourceLabel} · ${request.exportedAt}`,
    MARGIN,
    writer.cursor,
    META_SIZE,
    MUTED,
  );
  writer.cursor -= 18;

  const columns = layoutColumns(engine, request);
  drawTableHeader(writer, engine, columns);

  const bottom = MARGIN + 28;
  data.rows.forEach((row, rowIndex) => {
    if (writer.cursor - ROW_HEIGHT < bottom) {
      writer.newPage();
      drawTableHeader(writer, engine, columns);
    }
    const top = writer.cursor;
    if (rowIndex % 2 === 1) {
      writer.rect(MARGIN, top - ROW_HEIGHT, CONTENT_WIDTH, ROW_HEIGHT, STRIPE_FILL);
    }
    writer.rect(MARGIN, top - ROW_HEIGHT, CONTENT_WIDTH, 0.5, RULE);
    columns.forEach((column, index) => {
      const inner = column.width - CELL_PADDING * 2;
      const text = engine.truncate(
        sanitize(cellText(row[index] ?? null)),
        CELL_SIZE,
        inner,
      );
      if (column.numeric) {
        writer.text(
          text,
          column.x + column.width - CELL_PADDING,
          top - ROW_HEIGHT + 5,
          CELL_SIZE,
          INK,
          "right",
        );
      } else {
        writer.text(
          text,
          column.x + CELL_PADDING,
          top - ROW_HEIGHT + 5,
          CELL_SIZE,
          INK,
        );
      }
    });
    writer.cursor = top - ROW_HEIGHT;
  });

  const totals = data.totals || [];
  if (totals.length) {
    writer.cursor -= 18;
    for (const total of totals) {
      if (writer.cursor - 22 < bottom) writer.newPage();
      const top = writer.cursor;
      writer.rect(MARGIN, top - 20, CONTENT_WIDTH, 20, HEAD_FILL);
      writer.text(
        sanitize(total.label),
        MARGIN + CELL_PADDING,
        top - 14,
        TOTAL_SIZE,
        MUTED,
      );
      writer.text(
        sanitize(String(total.value)),
        MARGIN + CONTENT_WIDTH - CELL_PADDING,
        top - 14,
        TOTAL_SIZE,
        INK,
        "right",
      );
      writer.cursor = top - 24;
    }
  }

  const notes = data.notes || [];
  if (notes.length) {
    writer.cursor -= 8;
    for (const note of notes) {
      for (const line of engine.wrap(sanitize(note), NOTE_SIZE, CONTENT_WIDTH)) {
        if (writer.cursor - 14 < bottom) writer.newPage();
        writer.cursor -= 14;
        writer.text(line, MARGIN, writer.cursor, NOTE_SIZE, MUTED);
      }
    }
  }

  // 集外字符不许静默顶掉：页脚明写有几处、是哪几个码位。
  if (engine.substituted.size) {
    const codes = [...engine.substituted.keys()]
      .sort((a, b) => a - b)
      .slice(0, 8)
      .map((codePoint) => `U+${codePoint.toString(16).toUpperCase()}`)
      .join(" ");
    const count = [...engine.substituted.values()].reduce((a, b) => a + b, 0);
    const line = `本文档有 ${count} 处字符不在随包字形集中，已用 □ 代替：${codes}${
      engine.substituted.size > 8 ? " 等" : ""
    }`;
    for (const text of engine.wrap(line, NOTE_SIZE, CONTENT_WIDTH)) {
      if (writer.cursor - 14 < bottom) writer.newPage();
      writer.cursor -= 14;
      writer.text(text, MARGIN, writer.cursor, NOTE_SIZE, INK);
    }
  }

  // 页脚在全部内容排完之后才补：页数要等最后一页出现才知道。
  const pageCount = writer.pages.length;
  writer.pages.forEach((page, index) => {
    appendFooter(
      page,
      engine,
      `${request.sourceLabel} · 第 ${index + 1} / ${pageCount} 页`,
      MARGIN - 14,
    );
  });

  const subsets: Record<FontKey, TrueTypeSubset> = {
    latin: subsetTrueType(fonts.latin.font, engine.used.latin),
    cjk: subsetTrueType(fonts.cjk.font, engine.used.cjk),
  };
  return serialize(request, writer.pages, subsets, fonts);
}

function appendFooter(
  page: PageOps,
  engine: TextEngine,
  label: string,
  baseline: number,
): void {
  let cursorX = MARGIN;
  let run: TextRun | null = null;
  for (const character of sanitize(label)) {
    const resolved = engine.resolve(character.codePointAt(0)!);
    if (!run || run.fontKey !== resolved.fontKey) {
      run = {
        fontKey: resolved.fontKey,
        codePoints: [],
        x: cursorX,
        y: baseline,
        size: FOOTER_SIZE,
        color: FAINT,
      };
      page.runs.push(run);
    }
    run.codePoints.push(resolved.codePoint);
    cursorX += (resolved.advance * FOOTER_SIZE) / 1000;
  }
}

function serialize(
  request: NormalizedPluginExportRequest,
  pages: PageOps[],
  subsets: Record<FontKey, TrueTypeSubset>,
  fonts: PdfFontSet,
): Uint8Array {
  const writer = new PdfWriter();
  const catalogId = writer.reserve();
  const pagesId = writer.reserve();

  const fontName: Record<FontKey, string> = { latin: "F1", cjk: "F2" };
  const fontRefs: Record<FontKey, number> = { latin: 0, cjk: 0 };
  for (const key of ["latin", "cjk"] as const) {
    const subset = subsets[key];
    const tag = subsetTag(subset);
    const baseFont = `/${tag}+${fonts[key].name}`;
    const scale = 1000 / subset.unitsPerEm;
    const font = fonts[key].font;
    const fileId = writer.add(
      writer.stream(
        `/Length1 ${subset.bytes.length}`,
        subset.bytes,
      ),
    );
    const descriptorId = writer.add(
      `<< /Type /FontDescriptor /FontName ${baseFont} /Flags 4 /FontBBox [` +
        `${Math.round(font.bbox[0] * scale)} ${Math.round(font.bbox[1] * scale)} ` +
        `${Math.round(font.bbox[2] * scale)} ${Math.round(font.bbox[3] * scale)}] ` +
        `/ItalicAngle 0 /Ascent ${Math.round(font.ascender * scale)} ` +
        `/Descent ${Math.round(font.descender * scale)} /CapHeight ${Math.round(
          font.ascender * scale * 0.86,
        )} /StemV 80 /FontFile2 ${fileId} 0 R >>`,
    );
    const cidFontId = writer.add(
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont ${baseFont} ` +
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> " +
        `/FontDescriptor ${descriptorId} 0 R /DW 1000 /W ${widthArray(subset)} ` +
        "/CIDToGIDMap /Identity >>",
    );
    const toUnicodeId = writer.add(
      writer.stream("", strToU8(toUnicodeCMap(subset))),
    );
    fontRefs[key] = writer.add(
      `<< /Type /Font /Subtype /Type0 /BaseFont ${baseFont} /Encoding /Identity-H ` +
        `/DescendantFonts [${cidFontId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`,
    );
  }

  const resources =
    `<< /Font << /${fontName.latin} ${fontRefs.latin} 0 R ` +
    `/${fontName.cjk} ${fontRefs.cjk} 0 R >> >>`;
  const pageIds: number[] = [];
  for (const page of pages) {
    const contentId = writer.add(
      writer.stream("", strToU8(contentStream(page, subsets, fontName))),
    );
    pageIds.push(
      writer.add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${formatNumber(
          PAGE_WIDTH,
        )} ${formatNumber(PAGE_HEIGHT)}] /Resources ${resources} ` +
          `/Contents ${contentId} 0 R >>`,
      ),
    );
  }

  writer.set(
    pagesId,
    `<< /Type /Pages /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${pageIds.length} >>`,
  );
  writer.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const infoId = writer.add(
    `<< /Title ${pdfTextString(request.title)} ` +
      `/Author ${pdfTextString("OceanLeo")} ` +
      `/Subject ${pdfTextString(request.sourceLabel)} ` +
      `/Producer (${pdfLiteral("oceanleo.plugin-export.v1")}) ` +
      `/CreationDate (${pdfDate(request.exportedAt)}) >>`,
  );
  return writer.build(catalogId, infoId);
}
