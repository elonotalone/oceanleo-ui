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
export function gridDarkCanvasColor(color: string): string | null {
  const c = parseCanvasColor(color);
  if (!c) return null;
  if (same(c, 0, 0, 0)) return withAlpha(GRID_DARK_CANVAS.text, c.a);
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

/**
 * 画布本身透明清屏，看到的格子底其实是 Univer 容器的底色（暗色下是它自己的
 * `gray-800`，偏蓝）。在舞台根上把这几层压成 `GRID_DARK_CANVAS.cell`，让格子、
 * 表头、页脚是同一组灰。只在 `data-grid-univer-theme="dark"` 下生效。
 */
export const GRID_DARK_STAGE_CSS = `
[data-grid-univer-theme="dark"] [data-u-comp="workbench-layout"] {
  background-color: ${GRID_DARK_CANVAS.cell} !important;
}
`;
