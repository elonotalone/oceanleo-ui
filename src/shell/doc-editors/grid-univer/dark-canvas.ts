/**
 * 表格深色（D6）：格子、表头、网格线跟着变深，默认黑字显示为浅色，**用户设的底色 /
 * 字色原样保留**，存储内容一个字节不改。
 *
 * 为什么只在画布取色这一层做：
 * - Univer 自带的暗色（`ICanvasColorService` 默认实现）对画布上**每一种**颜色做
 *   保色相的明度反转——黄色底变橄榄、深蓝表头变浅蓝、红字变粉，用户设的颜色全被改了。
 * - 改单元格显示样式（CELL_CONTENT 拦截器）也不行：单元格编辑器拿拦截后的合成样式
 *   建文档，提交时 `getCellStyleBySnapshot` 把覆盖全文的文字样式写回 `cell.s`，
 *   显示用的颜色就被存进了用户文件。
 * 画布取色只影响「这一笔用什么颜色画」，模型、快照、导出、协同都看不见它。
 *
 * 映射表只认 Univer 画布的默认色（实读 0.25.1 engine-render）：
 * - 默认字色 `rgb(0,0,0)` / 表头字 `#000000` → 主题前景；
 * - 白（编辑器底、全选角、清屏底）→ 主题格子底；
 * - 表头底 `rgb(248,249,250)`、表头边 `rgb(217,217,217)`、网格线 `rgb(214,216,219)` → 深色调。
 * 其余颜色（用户的填充、字色、条件格式、选区高亮）原样返回。
 *
 * 两处要看上下文（`installGridDarkBackgroundPass` / `installGridDarkFontFill` 包住 Univer 的两个画布扩展）：
 * - 背景扩展画的全是用户填充：原样画，只有白底换深格。否则用户恰好用了与默认色
 *   同值的填充（Excel 常用灰 `#D9D9D9` = 表头边色）会被当成默认色变深。
 * - 字体扩展逐格画字：格子有用户填充时（黄底、浅绿底），默认黑字与浅字哪个对这块底
 *   对比度高就用哪个——浅字压浅底看不清。
 *
 * 本文件不 import Univer：颜色服务实例由舞台从注入器里取出来交给 `installGridDarkCanvas`。
 */

/** 深色画布的取值；与 `pluginWorkbenchStyle("dark")` 同一组中性灰。 */
export const GRID_DARK_CANVAS = {
  /** 格子底（画布本身透明，容器底也要用它，见 `GRID_DARK_STAGE_CSS`）。 */
  cell: "#18181b",
  /** 默认字色。 */
  text: "#e4e4e7",
  gridline: "#2f2f36",
  headerBackground: "#202024",
  headerText: "#a1a1aa",
  headerBorder: "#34343b",
} as const;

type Rgba = { r: number; g: number; b: number; a: number };

const NAMED: Record<string, Rgba> = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
};

export function parseCanvasColor(color: string): Rgba | null {
  const raw = color.trim().toLowerCase();
  if (NAMED[raw]) return NAMED[raw];
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(raw);
  if (hex) {
    let body = hex[1];
    if (body.length <= 4) body = body.split("").map((c) => c + c).join("");
    const n = (i: number) => Number.parseInt(body.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: body.length === 8 ? n(6) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(raw);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  return null;
}

function same(c: Rgba, r: number, g: number, b: number): boolean {
  return c.r === r && c.g === g && c.b === b;
}

function withAlpha(hex: string, a: number): string {
  if (a >= 1) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * 深色下这一笔画什么颜色。返回 `null` = 不是本表认识的默认色，交回调用方
 * （原样画，或交给 Univer 自己解析主题色 token）。
 */
function luminance(c: Rgba): number {
  const ch = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 深色下用户填充画成什么：白底 = 默认底，换深格；其它填充原样。 */
export function gridDarkFillColor(fill: string): string {
  const c = parseCanvasColor(fill);
  return c && same(c, 255, 255, 255) ? withAlpha(GRID_DARK_CANVAS.cell, c.a) : fill;
}

/** 深色下这块用户填充上的默认黑字：留黑（`true`）还是换主题浅字。 */
export function gridDarkKeepBlackOn(fill: string | null | undefined): boolean {
  if (!fill) return false;
  const raw = parseCanvasColor(fill);
  if (!raw || raw.a === 0) return false;
  // 按画出来的颜色判（白底在深色下是深格）。
  const shown = parseCanvasColor(gridDarkFillColor(fill)) ?? raw;
  const bg = luminance(shown);
  const light = luminance(parseCanvasColor(GRID_DARK_CANVAS.text) as Rgba);
  return contrast(0, bg) > contrast(light, bg);
}

export function gridDarkCanvasColor(
  color: string,
  cellFill: string | null = null,
): string | null {
  const c = parseCanvasColor(color);
  if (!c) return null;
  if (same(c, 0, 0, 0)) {
    return gridDarkKeepBlackOn(cellFill) ? color : withAlpha(GRID_DARK_CANVAS.text, c.a);
  }
  if (same(c, 255, 255, 255)) return withAlpha(GRID_DARK_CANVAS.cell, c.a);
  if (same(c, 248, 249, 250)) return withAlpha(GRID_DARK_CANVAS.headerBackground, c.a);
  if (same(c, 217, 217, 217)) return withAlpha(GRID_DARK_CANVAS.headerBorder, c.a);
  if (same(c, 214, 216, 219)) return withAlpha(GRID_DARK_CANVAS.gridline, c.a);
  return color;
}

const THEME_TOKEN = /^[a-z][a-z-]*\.\d{2,3}$/i;

export interface GridCanvasColorServiceLike {
  getRenderColor(color: string): string;
}

/**
 * 把颜色服务换成我们的映射。`isDark()` 为假时完全透传（浅色下与没装一样）；
 * 为真时只换默认色，其它颜色原样——不再走 Univer 的整体反转。
 * 返回卸载函数（舞台卸载时恢复原方法）。
 */
export function installGridDarkCanvas(
  service: GridCanvasColorServiceLike | null | undefined,
  isDark: () => boolean,
): () => void {
  if (!service || typeof service.getRenderColor !== "function") return () => {};
  const original = service.getRenderColor.bind(service);
  const cache = new Map<string, string>();
  service.getRenderColor = (color: string) => {
    if (!isDark() || typeof color !== "string") return color;
    // 背景扩展正在画用户填充：原样（白底除外），不进缓存。
    if (fillPass) return gridDarkFillColor(color);
    // 正在画某一格的字且那格有填充：黑字按底色判，不进缓存（同一色在别的格子答案不同）。
    if (fontFill) {
      const black = parseCanvasColor(color);
      if (black && same(black, 0, 0, 0)) return gridDarkCanvasColor(color, fontFill) ?? color;
    }
    const hit = cache.get(color);
    if (hit !== undefined) return hit;
    const mapped = gridDarkCanvasColor(color);
    // 认不出的：Univer 主题色 token（`primary.600`）交回原实现解析；
    // 其它（具名色、hsl、transparent）原样画，不让原实现把它们反转。
    const next = mapped ?? (THEME_TOKEN.test(color) ? original(color) : color);
    cache.set(color, next);
    return next;
  };
  return () => {
    service.getRenderColor = original;
  };
}

/** 字体扩展正在画的那一格的填充色（同步绘制期间有效，画完复位）。 */
let fontFill: string | null = null;
/** 背景扩展正在画（这期间每一笔都是用户填充）。 */
let fillPass = false;

interface ObjectMatrixLike {
  getValue(row: number, col: number): unknown;
}

interface GridSkeletonLike {
  stylesCache?: { background?: Record<string, ObjectMatrixLike | undefined> };
}

type RenderFontEachCell = (
  renderContext: { spreadsheetSkeleton?: GridSkeletonLike } | undefined,
  row: number,
  col: number,
  ...rest: unknown[]
) => unknown;

/** Univer 字体扩展（`DefaultFontExtension`）上本模块用到的那一个方法。 */
export interface GridFontExtensionLike {
  _renderFontEachCell?: RenderFontEachCell;
}

/** Univer 背景扩展（`DefaultBackgroundExtension`）的整趟绘制。 */
export interface GridBackgroundExtensionLike {
  draw?: (...args: unknown[]) => unknown;
}

/** 骨架的背景缓存是「颜色 → 格子矩阵」：找出这一格落在哪个颜色里。 */
export function gridCellFillAt(
  skeleton: GridSkeletonLike | undefined,
  row: number,
  col: number,
): string | null {
  const background = skeleton?.stylesCache?.background;
  if (!background) return null;
  for (const [rgb, matrix] of Object.entries(background)) {
    const value = matrix?.getValue?.(row, col);
    if (value !== undefined && value !== null) return rgb;
  }
  return null;
}

const PATCHED = new WeakMap<GridFontExtensionLike, () => void>();

/**
 * 包住字体扩展的逐格绘制：画某格的字之前把它的填充色交给取色层，画完复位。
 * 只在深色下查填充（浅色下取色层整体透传，查了也白查）。同一个扩展只包一次；
 * 返回卸载函数。拿不到扩展或方法签名不对就什么也不做。
 */
export function installGridDarkFontFill(
  extension: GridFontExtensionLike | null | undefined,
  isDark: () => boolean,
): () => void {
  if (!extension || typeof extension._renderFontEachCell !== "function") return () => {};
  const existing = PATCHED.get(extension);
  if (existing) return existing;
  const ownBefore = Object.prototype.hasOwnProperty.call(extension, "_renderFontEachCell");
  const original = extension._renderFontEachCell;
  extension._renderFontEachCell = function (this: unknown, renderContext, row, col, ...rest) {
    if (!isDark()) return original.call(this, renderContext, row, col, ...rest);
    const previous = fontFill;
    fontFill = gridCellFillAt(renderContext?.spreadsheetSkeleton, row, col);
    try {
      return original.call(this, renderContext, row, col, ...rest);
    } finally {
      fontFill = previous;
    }
  };
  const uninstall = () => {
    if (PATCHED.get(extension) !== uninstall) return;
    PATCHED.delete(extension);
    if (ownBefore) extension._renderFontEachCell = original;
    else delete extension._renderFontEachCell;
  };
  PATCHED.set(extension, uninstall);
  return uninstall;
}

/** 包住背景扩展的 `draw`：这一趟里取色层把颜色当用户填充（原样，白底换深格）。 */
export function installGridDarkBackgroundPass(
  extension: GridBackgroundExtensionLike | null | undefined,
  isDark: () => boolean,
): () => void {
  if (!extension || typeof extension.draw !== "function") return () => {};
  const key = extension as unknown as GridFontExtensionLike;
  const existing = PATCHED.get(key);
  if (existing) return existing;
  const ownBefore = Object.prototype.hasOwnProperty.call(extension, "draw");
  const original = extension.draw;
  extension.draw = function (this: unknown, ...args: unknown[]) {
    if (!isDark()) return original.apply(this, args);
    const previous = fillPass;
    fillPass = true;
    try {
      return original.apply(this, args);
    } finally {
      fillPass = previous;
    }
  };
  const uninstall = () => {
    if (PATCHED.get(key) !== uninstall) return;
    PATCHED.delete(key);
    if (ownBefore) extension.draw = original;
    else delete extension.draw;
  };
  PATCHED.set(key, uninstall);
  return uninstall;
}

/**
 * 画布本身透明清屏，看到的格子底其实是 Univer 容器的底色（暗色下是它自己的
 * `gray-800`，偏蓝）。在舞台根上把这几层压成 `GRID_DARK_CANVAS.cell`，让格子、
 * 表头、页脚是同一组灰。只在 `data-grid-univer-theme="dark"` 下生效。
 * 舞台外层（普通模式给编辑栏留的上边距那一条）也用同一色，不出一道更黑的缝。
 */
export const GRID_DARK_STAGE_CSS = `
[data-grid-univer-theme="dark"] [data-u-comp="workbench-layout"],
:has(> [data-grid-univer-stage][data-grid-univer-theme="dark"]) {
  background-color: ${GRID_DARK_CANVAS.cell} !important;
}
`;
