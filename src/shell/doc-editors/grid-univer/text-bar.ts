/**
 * 表格「编辑」页的统一文字栏（`00-dispatch.md` §4 文字组 + A-1）。
 *
 * Univer 普通模式关掉了 ribbon，选中格子时 OceanLeo 编辑栏就是唯一的格式入口，
 * 所以这里给出**规范 id**（字体、字号、粗斜下删、文字颜色、高亮 = 单元格底色、对齐），
 * 外壳按词表统一出图标、标签、顺序。规范项之后是表格特有控件（垂直对齐、自动换行、
 * 合并、边框），它们的 id 都带 `grid-` 前缀或沿用旧 id，不借规范 id 的图标。
 *
 * 值跟着当前格子：舞台在每次选区 / 命令变化后读一次活动区域的样式
 * （`gridCellTextStyleFromStyleData`），再用它出控件。本文件不 import Univer
 * 运行时，测试直接加载。
 */
import type {
  SelectionControl,
  SelectionControlOption,
} from "../../selection-context-types";
import type { UITranslate } from "../../../i18n/ui/useUI";

/** Univer `IStyleData` 里栏要读的那几位（鸭子类型，不拖进 Univer 的类型）。 */
export interface GridStyleDataLike {
  ff?: string | null;
  fs?: number | null;
  bl?: number | null;
  it?: number | null;
  ul?: { s?: number | null } | null;
  st?: { s?: number | null } | null;
  cl?: { rgb?: string | null } | null;
  bg?: { rgb?: string | null } | null;
  /** HorizontalAlign：1 左 / 2 中 / 3 右（0 未设）。 */
  ht?: number | null;
  /** VerticalAlign：1 上 / 2 中 / 3 下（0 未设）。 */
  vt?: number | null;
  /** WrapStrategy：1 溢出 / 2 截断 / 3 换行。 */
  tb?: number | null;
  /** 边框：上下左右各一项，有值 = 有这条边。 */
  bd?: { t?: unknown; b?: unknown; l?: unknown; r?: unknown } | null;
}

export type GridHorizontalAlign = "left" | "center" | "right";
export type GridVerticalAlign = "top" | "middle" | "bottom";

/** 栏上显示的当前格子样式。 */
export interface GridCellTextStyle {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** `#rrggbb`。 */
  textColor: string;
  /** 单元格底色 `#rrggbb`；没有底色时是白（色块上看到的就是「无底色」的纸色）。 */
  highlight: string;
  align: GridHorizontalAlign;
  verticalAlign: GridVerticalAlign;
  wrap: boolean;
  /** 选区落在合并单元格上。 */
  merged: boolean;
  /** 选区不止一格（合并才有意义）。 */
  multiCell: boolean;
  /** 左上格的框线：all / none / 单边；几条边混着时为空串。 */
  border: string;
}

/** Univer 的默认字体 / 字号（`DEFAULT_STYLES`：Arial 11）。 */
export const GRID_DEFAULT_FONT_FAMILY = "Arial";
export const GRID_DEFAULT_FONT_SIZE = 11;
export const GRID_FONT_SIZE_MIN = 6;
export const GRID_FONT_SIZE_MAX = 96;

export const GRID_DEFAULT_TEXT_STYLE: GridCellTextStyle = {
  fontFamily: GRID_DEFAULT_FONT_FAMILY,
  fontSize: GRID_DEFAULT_FONT_SIZE,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  textColor: "#000000",
  highlight: "#ffffff",
  align: "left",
  verticalAlign: "bottom",
  wrap: false,
  merged: false,
  multiCell: false,
  border: "none",
};

/**
 * 字体候选：取 Univer 专业模式 ribbon 自带清单（`@univerjs/ui` 的
 * `DEFAULT_FONT_LIST`）里常用的那几项，值逐字相同——两处切换后显示同一个字体名。
 * 中文字体名要翻译（英文界面显示 Microsoft YaHei），拉丁字体名原样。
 */
const GRID_FONT_FAMILIES: readonly { value: string; label?: string }[] = [
  { value: "Arial" },
  { value: "Times New Roman" },
  { value: "Tahoma" },
  { value: "Verdana" },
  { value: "Microsoft YaHei", label: "微软雅黑" },
  { value: "SimSun", label: "宋体" },
  { value: "SimHei", label: "黑体" },
  { value: "Kaiti", label: "楷体" },
  { value: "FangSong", label: "仿宋" },
];

export function gridFontFamilyOptions(
  current: string,
  tt: UITranslate,
): SelectionControlOption[] {
  const options = GRID_FONT_FAMILIES.map((font) => ({
    value: font.value,
    label: font.label ? tt(font.label) : font.value,
  }));
  // 文件里用的字体不在候选里（xlsx 常见 Calibri / 等线）：也要显示出它的名字。
  if (current && !options.some((option) => option.value === current)) {
    options.unshift({ value: current, label: current });
  }
  return options;
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i;

/** Univer 存的颜色可能是 `#abc` / `#aabbcc` / `rgb(…)`；栏的色块只认 `#rrggbb`。 */
export function gridHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (HEX6.test(raw)) return raw.toLowerCase();
  if (HEX3.test(raw)) {
    return `#${raw
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("")}`.toLowerCase();
  }
  const rgb = RGB.exec(raw);
  if (rgb) {
    const hex = rgb
      .slice(1, 4)
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0"))
      .join("");
    return `#${hex}`;
  }
  return fallback;
}

function on(value: unknown): boolean {
  return value === 1 || value === true;
}

export function gridCellTextStyleFromStyleData(
  style: GridStyleDataLike | null | undefined,
  extras: { merged?: boolean; multiCell?: boolean } = {},
): GridCellTextStyle {
  const s = style || {};
  const fontSize =
    typeof s.fs === "number" && Number.isFinite(s.fs) && s.fs > 0
      ? s.fs
      : GRID_DEFAULT_FONT_SIZE;
  return {
    fontFamily:
      typeof s.ff === "string" && s.ff.trim()
        ? s.ff.trim()
        : GRID_DEFAULT_FONT_FAMILY,
    fontSize,
    bold: on(s.bl),
    italic: on(s.it),
    underline: on(s.ul?.s),
    strike: on(s.st?.s),
    textColor: gridHexColor(s.cl?.rgb, GRID_DEFAULT_TEXT_STYLE.textColor),
    highlight: gridHexColor(s.bg?.rgb, GRID_DEFAULT_TEXT_STYLE.highlight),
    align: s.ht === 2 ? "center" : s.ht === 3 ? "right" : "left",
    // Univer 未设时按「靠下」画（与 Excel 一致）。
    verticalAlign: s.vt === 1 ? "top" : s.vt === 2 ? "middle" : "bottom",
    wrap: s.tb === 3,
    merged: Boolean(extras.merged),
    multiCell: Boolean(extras.multiCell),
    border: gridBorderState(s.bd),
  };
}

/** 左上格的四条边 → 边框下拉的当前值（混合时空串）。 */
export function gridBorderState(bd: GridStyleDataLike["bd"]): string {
  const sides = (["t", "b", "l", "r"] as const).filter((side) => {
    const edge = bd?.[side] as { s?: number } | null | undefined;
    return Boolean(edge) && edge?.s !== 0;
  });
  if (sides.length === 0) return "none";
  if (sides.length === 4) return "all";
  if (sides.length === 1) {
    return { t: "top", b: "bottom", l: "left", r: "right" }[sides[0]];
  }
  return "";
}

/** 两次读到的样式是否一样（选区移动时不必要的重渲染靠它挡掉）。 */
export function gridCellTextStyleKey(style: GridCellTextStyle): string {
  return [
    style.fontFamily,
    style.fontSize,
    style.bold ? 1 : 0,
    style.italic ? 1 : 0,
    style.underline ? 1 : 0,
    style.strike ? 1 : 0,
    style.textColor,
    style.highlight,
    style.align,
    style.verticalAlign,
    style.wrap ? 1 : 0,
    style.merged ? 1 : 0,
    style.multiCell ? 1 : 0,
    style.border,
  ].join("|");
}

/**
 * 文字组的规范 id，顺序即显示顺序（§4）。表格做不到的 `list`、`line-height`
 * 不出；`link` 由 Univer 自己的链接面板承担（右键菜单），这里不另造输入框。
 */
export const GRID_TEXT_BAR_IDS = [
  "font-family",
  "font-size",
  "bold",
  "italic",
  "underline",
  "strike",
  "text-color",
  "highlight",
  "align",
] as const;

/** 规范文字组之后的表格特有控件（不带规范图标，见 A-1）。 */
export const GRID_CELL_BAR_IDS = [
  "grid-valign",
  "grid-wrap",
  "merge-cells",
  "grid-border",
] as const;

/** 「更多」里的规范项。 */
export const GRID_TEXT_MORE_IDS = ["clear-format"] as const;

export const GRID_BORDER_OPTIONS = [
  "all",
  "outside",
  "inside",
  "top",
  "bottom",
  "left",
  "right",
  "none",
] as const;

export type GridBorderOption = (typeof GRID_BORDER_OPTIONS)[number];

const BORDER_LABELS: Record<GridBorderOption, string> = {
  all: "所有框线",
  outside: "外侧框线",
  inside: "内部框线",
  top: "上框线",
  bottom: "下框线",
  left: "左框线",
  right: "右框线",
  none: "无框线",
};

/**
 * 出文字栏与表格特有控件。`merge-cells` 只在「多格」或「已合并」时出：
 * 单个普通格子点合并没有任何效果，不放死按钮。
 */
export function gridTextBarControls(
  style: GridCellTextStyle,
  tt: UITranslate,
): SelectionControl[] {
  const text: SelectionControl[] = [
    {
      id: "font-family",
      kind: "select",
      label: tt("字体"),
      icon: "font",
      iconOnly: true,
      group: "typography",
      value: style.fontFamily,
      options: gridFontFamilyOptions(style.fontFamily, tt),
    },
    {
      id: "font-size",
      kind: "number",
      label: tt("字号"),
      icon: "font-size",
      iconOnly: true,
      group: "typography",
      value: style.fontSize,
      min: GRID_FONT_SIZE_MIN,
      max: GRID_FONT_SIZE_MAX,
      step: 1,
    },
    toggle("bold", tt("粗体"), "bold", style.bold),
    toggle("italic", tt("斜体"), "italic", style.italic),
    toggle("underline", tt("下划线"), "underline", style.underline),
    toggle("strike", tt("删除线"), "strike", style.strike),
    {
      id: "text-color",
      kind: "color",
      label: tt("文字色"),
      icon: "color",
      iconOnly: true,
      group: "typography",
      value: style.textColor,
    },
    {
      id: "highlight",
      kind: "color",
      label: tt("底色"),
      icon: "background",
      iconOnly: true,
      group: "typography",
      value: style.highlight,
    },
    {
      id: "align",
      kind: "select",
      label: tt("对齐"),
      icon: "align-left",
      iconOnly: true,
      group: "typography",
      value: style.align,
      options: [
        { value: "left", label: tt("左") },
        { value: "center", label: tt("中") },
        { value: "right", label: tt("右") },
      ],
    },
  ];
  const cell: SelectionControl[] = [
    {
      id: "grid-valign",
      kind: "select",
      label: tt("垂直对齐"),
      iconOnly: false,
      group: "format",
      value: style.verticalAlign,
      options: [
        { value: "top", label: tt("靠上") },
        { value: "middle", label: tt("居中") },
        { value: "bottom", label: tt("靠下") },
      ],
    },
    {
      id: "grid-wrap",
      kind: "toggle",
      label: tt("自动换行"),
      iconOnly: false,
      group: "format",
      value: style.wrap,
    },
  ];
  if (style.merged || style.multiCell) {
    cell.push({
      id: "merge-cells",
      kind: "toggle",
      label: tt(style.merged ? "取消合并" : "合并单元格"),
      iconOnly: false,
      group: "format",
      value: style.merged,
    });
  }
  cell.push({
    id: "grid-border",
    kind: "select",
    label: tt("边框"),
    iconOnly: false,
    group: "format",
    // 当前值是左上格实际的框线（单格时「外侧」就是「所有」，回读显示为所有框线）。
    value: style.border,
    options: GRID_BORDER_OPTIONS.map((value) => ({
      value,
      label: tt(BORDER_LABELS[value]),
    })),
  });
  const more: SelectionControl[] = [
    {
      id: "clear-format",
      kind: "action",
      label: tt("清除格式"),
      iconOnly: false,
      group: "typography",
      placement: "more",
    },
  ];
  return [...text, ...cell, ...more];
}

function toggle(
  id: string,
  label: string,
  icon: NonNullable<SelectionControl["icon"]>,
  value: boolean,
): SelectionControl {
  return {
    id,
    kind: "toggle",
    label,
    icon,
    iconOnly: true,
    group: "typography",
    value,
  };
}
