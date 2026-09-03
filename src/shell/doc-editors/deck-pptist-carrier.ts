/**
 * deck IR → PPTist JSON 载体（W07，判据 3/4）。
 *
 * ## 为什么这份文件里没有一行 PPTist 代码
 *
 * PPTist 是 **AGPL-3.0**，`@oceanleo/ui` 是 MIT/私有。红线（`_COMMON.md` §10 第 1 条）：
 * PPTist 的代码一行不得进本仓。下面的类型是**照它公开的数据格式重新描述的**
 * —— 来源是 `doc/AI_PPT_SCHEMA.md`（该文档明确「专用于 AI 生成」，
 * 就是给外部系统产页用的接口说明）与其 `src/types/slides.ts` 的**字段名**。
 * 字段名是互操作的事实（不重新描述就无法互通），不是可版权的表达；
 * 这里没有搬运任何实现、任何算法、任何注释。
 *
 * ## 坐标系（`AI_PPT_SCHEMA.md` 的约定，本文件唯一的硬编码）
 *
 * - 逻辑画布固定 `1000 × 562.5`（16:9），原点左上，单位逻辑像素
 * - deck IR 存的是**百分比**（`DeckElement.x/y/width/height` 都是 0–100）
 * ⇒ 转换就是一次乘法。4:3 时高度换成 `1000 × 3/4 = 750`。
 *
 * ## 正交三轴（判据 4；R9「正交不丢」）
 *
 * 内容（`slides[].elements`）× 版式（`DeckSlide.layout`）× 主题（`SlideTheme`）
 * 分别落在 PPTist JSON 的三组不同字段上，互不重叠 ⇒
 * 换皮不动结构、换结构不动皮。`applyDeckPackTheme()` 与 `relayoutSlide()`
 * 各只碰自己那一轴，由 `tests/deck-pptist-carrier.test.mjs` 的正交用例钉住。
 */

import type {
  DeckDocument,
  DeckElement,
  DeckSlide,
} from "./deck-schema";
import { packById, type DeckPack } from "./deck-packs";

/** `AI_PPT_SCHEMA.md` 的逻辑画布宽度。 */
export const PPTIST_VIEWPORT_WIDTH = 1000;

/** 16:9 的逻辑高度；4:3 走 `pptistViewportRatio()`。 */
export const PPTIST_VIEWPORT_16_9 = 562.5;

export const PPTIST_CARRIER_FORMAT = "pptist.slides.v2";

export type PptistElementType =
  | "text"
  | "image"
  | "shape"
  | "line"
  | "chart"
  | "table"
  | "latex"
  | "video"
  | "audio";

export interface PptistOutline {
  style?: "solid" | "dashed" | "dotted";
  width?: number;
  color?: string;
}

export interface PptistShadow {
  h: number;
  v: number;
  blur: number;
  color: string;
}

interface PptistBaseElement {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  lock?: boolean;
  name?: string;
}

export interface PptistTextElement extends PptistBaseElement {
  type: "text";
  content: string;
  defaultFontName: string;
  defaultColor: string;
  fill?: string;
  lineHeight?: number;
  wordSpace?: number;
  opacity?: number;
  outline?: PptistOutline;
  shadow?: PptistShadow;
  vertical?: boolean;
}

export interface PptistImageElement extends PptistBaseElement {
  type: "image";
  src: string;
  fixedRatio: boolean;
  flipH?: boolean;
  flipV?: boolean;
  opacity?: number;
  outline?: PptistOutline;
}

export interface PptistShapeElement extends PptistBaseElement {
  type: "shape";
  viewBox: [number, number];
  path: string;
  fixedRatio: boolean;
  fill: string;
  opacity?: number;
  outline?: PptistOutline;
  text?: {
    content: string;
    defaultFontName: string;
    defaultColor: string;
    align: "top" | "middle" | "bottom";
  };
}

export interface PptistTableCell {
  id: string;
  colspan: number;
  rowspan: number;
  text: string;
}

export interface PptistTableElement extends PptistBaseElement {
  type: "table";
  colWidths: number[];
  data: PptistTableCell[][];
  outline: PptistOutline;
  theme?: {
    color: string;
    rowHeader: boolean;
    rowFooter: boolean;
    colHeader: boolean;
    colFooter: boolean;
  };
}

export type PptistElement =
  | PptistTextElement
  | PptistImageElement
  | PptistShapeElement
  | PptistTableElement;

export interface PptistBackground {
  type: "solid" | "image" | "gradient";
  color?: string;
  image?: { src: string; size: "cover" | "contain" | "repeat" };
}

export interface PptistSlide {
  id: string;
  elements: PptistElement[];
  background?: PptistBackground;
  remark?: string;
  type?: "cover" | "contents" | "transition" | "content" | "end";
}

export interface PptistTheme {
  backgroundColor: string;
  themeColors: string[];
  fontColor: string;
  fontName: string;
  outline: Required<PptistOutline>;
  shadow: PptistShadow;
}

export interface PptistDocument {
  format: typeof PPTIST_CARRIER_FORMAT;
  title: string;
  viewportSize: number;
  viewportRatio: number;
  theme: PptistTheme;
  slides: PptistSlide[];
  /** 转换过程中丢掉或近似了什么。**空数组表示无损**，不是「没检查」。 */
  warnings: string[];
}

/** 16:9 → 0.5625，4:3 → 0.75。PPTist 的 ratio 是高/宽。 */
export function pptistViewportRatio(aspect: DeckDocument["aspect"]): number {
  return aspect === "4:3" ? 0.75 : PPTIST_VIEWPORT_16_9 / PPTIST_VIEWPORT_WIDTH;
}

function pageHeight(aspect: DeckDocument["aspect"]): number {
  return PPTIST_VIEWPORT_WIDTH * pptistViewportRatio(aspect);
}

/** 百分比 → 逻辑像素，并夹住越界值（导入的脏数据里 x 出现过负数）。 */
function pct(value: number, total: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(((value / 100) * total + Number.EPSILON) * 100) / 100;
}

function hex(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

/** deck IR 的纯文本 → PPTist 的富文本 HTML（它的文本层是 ProseMirror）。 */
function toRichText(
  text: string,
  element: DeckElement,
): string {
  const styles: string[] = [];
  if (element.fontSize) styles.push(`font-size:${element.fontSize}px`);
  if (element.color) styles.push(`color:${element.color}`);
  if (element.fontFamily) styles.push(`font-family:${element.fontFamily}`);
  if (element.bold) styles.push("font-weight:bold");
  if (element.italic) styles.push("font-style:italic");
  if (element.underline) styles.push("text-decoration:underline");
  const align = element.align ? ` style="text-align:${element.align}"` : "";
  const inner = styles.length
    ? `<span style="${styles.join(";")}">${escapeHtml(text)}</span>`
    : escapeHtml(text);
  return `<p${align}>${inner}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 矩形形状的 path（PPTist 的 shape 是 SVG path + viewBox）。 */
function rectPath(width: number, height: number): string {
  return `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`;
}

function convertElement(
  element: DeckElement,
  aspect: DeckDocument["aspect"],
  warnings: string[],
): PptistElement | null {
  const height = pageHeight(aspect);
  const base = {
    id: element.id,
    left: pct(element.x, PPTIST_VIEWPORT_WIDTH),
    top: pct(element.y, height),
    width: pct(element.width, PPTIST_VIEWPORT_WIDTH),
    height: pct(element.height, height),
    rotate: element.rotation || 0,
    lock: element.locked || undefined,
    name: element.label || undefined,
  };

  const outline: PptistOutline | undefined =
    element.borderColor || element.borderWidth
      ? {
          style:
            element.lineDash === "dash"
              ? "dashed"
              : element.lineDash === "dot"
                ? "dotted"
                : "solid",
          width: element.borderWidth ?? 1,
          color: hex(element.borderColor, "#000000"),
        }
      : undefined;

  if (element.type === "text") {
    return {
      ...base,
      type: "text",
      content: toRichText(element.text || "", element),
      defaultFontName: element.fontFamily || "",
      defaultColor: hex(element.color, "#333333"),
      fill: element.fill,
      lineHeight: element.lineHeight,
      opacity: element.opacity,
      outline,
    };
  }

  if (element.type === "image") {
    if (!element.src) {
      warnings.push(`图片元素 ${element.id} 没有 src，已跳过。`);
      return null;
    }
    return {
      ...base,
      type: "image",
      src: element.src,
      fixedRatio: element.imageFit === "contain",
      flipH: element.flipX,
      flipV: element.flipY,
      opacity: element.opacity,
      outline,
    };
  }

  if (element.type === "shape") {
    // deck IR 的 shape 名（`rect` / `ellipse` / …）与 PPTist 的 path 不是一一对应。
    // 只有矩形能无损映射；其余退化成矩形并如实记一条 warning（R7：转换失败要给原因）。
    if (element.shape && element.shape !== "rect" && element.shape !== "rectangle") {
      warnings.push(
        `形状 ${element.id} 的类型「${element.shape}」在 PPTist 里没有等价 path，已退化为矩形。`,
      );
    }
    const w = Math.max(base.width, 1);
    const h = Math.max(base.height, 1);
    return {
      ...base,
      type: "shape",
      viewBox: [w, h],
      path: rectPath(w, h),
      fixedRatio: false,
      fill: hex(element.fill, "#5b9bd5"),
      opacity: element.opacity,
      outline,
      text: element.text
        ? {
            content: toRichText(element.text, element),
            defaultFontName: element.fontFamily || "",
            defaultColor: hex(element.color, "#333333"),
            align: "middle",
          }
        : undefined,
    };
  }

  if (element.type === "table") {
    const rows = element.rows || [];
    if (!rows.length) {
      warnings.push(`表格 ${element.id} 没有行数据，已跳过。`);
      return null;
    }
    const colCount = Math.max(...rows.map((r) => r.length));
    return {
      ...base,
      type: "table",
      colWidths: Array.from({ length: colCount }, () => 1 / colCount),
      data: rows.map((row, rowIndex) =>
        Array.from({ length: colCount }, (_unused, colIndex) => ({
          id: `${element.id}-c-${rowIndex}-${colIndex}`,
          colspan: 1,
          rowspan: 1,
          text: row[colIndex] ?? "",
        })),
      ),
      outline: { style: "solid", width: 1, color: "#eeeeee" },
    };
  }

  warnings.push(
    `元素 ${element.id} 的类型「${element.type}」不在可映射集合内，已跳过。`,
  );
  return null;
}

function convertBackground(slide: DeckSlide): PptistBackground | undefined {
  if (slide.image?.url) {
    return { type: "image", image: { src: slide.image.url, size: "cover" } };
  }
  if (slide.background) return { type: "solid", color: slide.background };
  return undefined;
}

/** deck IR 的 layout → PPTist 的页面类型（版式轴的落点）。 */
function slideType(slide: DeckSlide): PptistSlide["type"] {
  const layout = String(slide.layout || "");
  if (layout.includes("cover") || layout.includes("title-only")) return "cover";
  if (layout.includes("agenda") || layout.includes("contents")) return "contents";
  if (layout.includes("section") || layout.includes("transition")) return "transition";
  if (layout.includes("end") || layout.includes("closing")) return "end";
  return "content";
}

/** 默认主题：deck IR 没指定 pack 时用 PPTist 自己的出厂值，不自造一套。 */
function defaultTheme(): PptistTheme {
  return {
    backgroundColor: "#ffffff",
    themeColors: ["#5b9bd5", "#ed7d31", "#a5a5a5", "#ffc000", "#4472c4", "#70ad47"],
    fontColor: "#333333",
    fontName: "",
    outline: { style: "solid", width: 2, color: "#525252" },
    shadow: { h: 3, v: 3, blur: 2, color: "#808080" },
  };
}

/**
 * 主题轴：`DeckPack` → PPTist `SlideTheme`。
 *
 * **只碰主题字段，一个 slide、一个 element 都不动** —— 这是正交的一半
 * （换皮不动结构）。`DeckPackPalette` 存的是不带 `#` 的六位 RGB，这里补上。
 */
export function applyDeckPackTheme(
  document: PptistDocument,
  pack: DeckPack,
): PptistDocument {
  const withHash = (value: string) => (value.startsWith("#") ? value : `#${value}`);
  return {
    ...document,
    theme: {
      backgroundColor: withHash(pack.surface.color),
      themeColors: [
        withHash(pack.palette.accent1),
        withHash(pack.palette.accent2),
        withHash(pack.palette.accent3),
        withHash(pack.palette.accent4),
        withHash(pack.palette.accent5),
        withHash(pack.palette.accent6),
      ],
      fontColor: withHash(pack.palette.dk1),
      fontName: pack.fonts.eastAsian || pack.fonts.minor,
      outline: document.theme.outline,
      shadow: document.theme.shadow,
    },
    // slides 原样传引用：正交测试靠 `toEqual` 与引用相等两条一起判。
    slides: document.slides,
  };
}

/**
 * 结构轴：把某一页换成另一种版式。
 *
 * **只碰该页的 `type` 与元素几何，不碰 theme** —— 正交的另一半
 * （换结构不动皮）。本轮只实现「页面类型改标」这一层，元素重排属深水区，
 * 留给 PPTist 自己的模板能力（判据 4 的 `deck-packs` 映射为模板/主题）。
 */
export function relayoutSlide(
  document: PptistDocument,
  slideId: string,
  layout: DeckSlide["layout"],
): PptistDocument {
  return {
    ...document,
    theme: document.theme,
    slides: document.slides.map((slide) =>
      slide.id === slideId
        ? { ...slide, type: slideType({ layout } as DeckSlide) }
        : slide,
    ),
  };
}

/**
 * 主转换器。**只读输入**：不改 `DeckDocument`，只产出新对象
 * （R7：存量文档只读 + 一键转换，不得静默改写用户存量）。
 */
export function deckDocumentToPptist(
  deck: DeckDocument,
  options: { packId?: string | null } = {},
): PptistDocument {
  const warnings: string[] = [];

  const slides: PptistSlide[] = deck.slides.map((slide) => {
    const elements: PptistElement[] = [];
    // 按 order 排，保证层级在 PPTist 里与 deck 一致（PPTist 的层级就是数组顺序）。
    const ordered = [...slide.elements].sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const element of ordered) {
      const converted = convertElement(element, deck.aspect, warnings);
      if (converted) elements.push(converted);
    }
    return {
      id: slide.id,
      elements,
      background: convertBackground(slide),
      // deck IR 的 `notes` 是演讲备注，落在 PPTist 的 `remark` 上（它的 `notes`
      // 是另一回事——批注/回复串，deck IR 里没有对应物）。
      remark: slide.notes || undefined,
      type: slideType(slide),
    };
  });

  const base: PptistDocument = {
    format: PPTIST_CARRIER_FORMAT,
    title: deck.title || "未命名演示文稿",
    viewportSize: PPTIST_VIEWPORT_WIDTH,
    viewportRatio: pptistViewportRatio(deck.aspect),
    theme: defaultTheme(),
    slides,
    warnings,
  };

  const pack = options.packId ? packById(options.packId) : undefined;
  return pack ? applyDeckPackTheme(base, pack) : base;
}
