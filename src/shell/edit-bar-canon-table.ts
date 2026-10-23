/**
 * 统一编辑栏词表的数据面（表、别名、栏推断）。对外一律从 `edit-bar-canon.ts` 引。
 *
 * 统一编辑栏词表（2026-10-23 操作员裁定 D9，接口见
 * `docs/work-logs/2026-10-23-editor-overhaul/00-dispatch.md` §4）。
 *
 * 编辑器只给**规范 id**；图标、标签、顺序、分组由外壳统一出（投影在
 * `edit-bar-canon-projection.ts`，`SelectionToolbar` 对所有编辑器调用）。
 * 编辑器自己写的 icon / label 对规范 id 无效。旧 id 经别名表归一，
 * 所以各编辑器改 id 之前投影也成立。
 *
 * 规则：
 * - 分组顺序：选区所属的那一组 → 其余类型组 → 对象组 → 编辑器特有控件。
 *   文本框这类「既是文字又有外框」的选区：文字组 → 形状组里适用的项 → 对象组。
 * - 规范 id 的图标只给规范 id 用：编辑器特有控件撞上就改显示文字。
 * - 做不到就不出这个 id；不出灰按钮。
 */
import type {
  SelectionBar,
  SelectionContext,
  SelectionControl,
  SelectionControlIcon,
  SelectionControlKind,
} from "./selection-context-types";

export type { SelectionBar } from "./selection-context-types";

export type EditBarCanonGroup = SelectionBar;

export type EditBarCanonId =
  // 文字组
  | "font-family" | "font-size" | "bold" | "italic" | "underline" | "strike"
  | "text-color" | "highlight" | "align" | "list" | "line-height" | "link"
  | "letter-spacing" | "case" | "vertical-text" | "indent-increase"
  | "indent-decrease" | "clear-format"
  // 图片组
  | "replace" | "crop" | "flip-x" | "flip-y" | "rotate" | "radius" | "border"
  | "opacity" | "adjust" | "alt" | "image-fit" | "remove-background"
  // 形状组（radius / opacity 与图片组共用）
  | "fill" | "stroke" | "shadow"
  // 对象组
  | "arrange" | "position" | "animation" | "lock" | "duplicate" | "delete";

export interface EditBarCanonEntry {
  id: EditBarCanonId;
  /** 主栏（primary）还是「更多」（more）。 */
  tier: "primary" | "more";
  /** 推荐的控件形态；投影保留编辑器给的 kind，只在形态不能上栏时改走面板。 */
  kinds: readonly SelectionControlKind[];
  icon: SelectionControlIcon;
  /** 中文原文；渲染处一律过 `tt(entry.label)`，16 语在 editor-overhaul-copy-w03。 */
  label: string;
}

const entry = (
  id: EditBarCanonId,
  tier: EditBarCanonEntry["tier"],
  kinds: readonly SelectionControlKind[],
  icon: SelectionControlIcon,
  label: string,
): EditBarCanonEntry => ({ id, tier, kinds, icon, label });

/** 规范项全表。数组顺序 = 组内显示顺序。 */
export const EDIT_BAR_CANON_GROUPS: Readonly<
  Record<EditBarCanonGroup, readonly EditBarCanonEntry[]>
> = {
  text: [
    entry("font-family", "primary", ["select", "panel"], "font", "字体"),
    entry("font-size", "primary", ["number", "select"], "font-size", "字号"),
    entry("bold", "primary", ["toggle"], "bold", "加粗"),
    entry("italic", "primary", ["toggle"], "italic", "斜体"),
    entry("underline", "primary", ["toggle"], "underline", "下划线"),
    entry("strike", "primary", ["toggle"], "strike", "删除线"),
    entry("text-color", "primary", ["color"], "text-color", "文字色"),
    entry("highlight", "primary", ["color"], "highlight", "高亮色"),
    entry("align", "primary", ["select"], "align-left", "对齐"),
    entry("list", "primary", ["select", "toggle"], "list", "项目列表"),
    entry("line-height", "primary", ["select", "number"], "line-height", "行间距"),
    entry("link", "primary", ["text", "panel", "action"], "link", "超链接"),
    entry("letter-spacing", "more", ["number", "select"], "letter-spacing", "字距"),
    entry("case", "more", ["select", "action"], "case", "大小写"),
    entry("vertical-text", "more", ["toggle"], "vertical-text", "竖排文字"),
    entry("indent-increase", "more", ["action"], "indent-increase", "增加缩进"),
    entry("indent-decrease", "more", ["action"], "indent-decrease", "减少缩进"),
    entry("clear-format", "more", ["action"], "clear-format", "清除样式"),
  ],
  image: [
    entry("replace", "primary", ["panel", "action"], "replace", "替换"),
    entry("crop", "primary", ["action", "toggle"], "crop", "裁剪"),
    entry("flip-x", "primary", ["action", "toggle"], "flip-horizontal", "水平翻转"),
    entry("flip-y", "primary", ["action", "toggle"], "flip-vertical", "垂直翻转"),
    entry("rotate", "primary", ["action"], "rotate", "旋转"),
    entry("radius", "primary", ["number", "range"], "radius", "圆角"),
    entry("border", "primary", ["panel", "color"], "border", "边框样式"),
    entry("opacity", "primary", ["range", "number"], "opacity", "不透明度"),
    entry("adjust", "primary", ["panel"], "adjust", "调色"),
    entry("alt", "more", ["text"], "alt", "替代文字"),
    entry("image-fit", "more", ["select"], "image-fit", "显示方式"),
    entry("remove-background", "more", ["action"], "remove-background", "抠图"),
  ],
  shape: [
    entry("fill", "primary", ["color"], "fill", "填充色"),
    entry("stroke", "primary", ["panel", "color"], "stroke", "描边样式"),
    entry("radius", "primary", ["number", "range"], "radius", "圆角"),
    entry("opacity", "primary", ["range", "number"], "opacity", "不透明度"),
    entry("shadow", "more", ["toggle", "panel"], "shadow", "阴影效果"),
  ],
  object: [
    entry("arrange", "primary", ["select"], "arrange", "层级"),
    entry("position", "primary", ["panel"], "position", "位置与尺寸"),
    entry("animation", "primary", ["select", "panel", "animation-gallery"], "animate", "动画"),
    entry("lock", "primary", ["toggle", "action"], "lock", "锁定"),
    entry("duplicate", "primary", ["action"], "duplicate", "复制一份"),
    entry("delete", "primary", ["action"], "delete", "删除"),
  ],
};

export const EDIT_BAR_CANON: Readonly<Record<EditBarCanonId, EditBarCanonEntry>> =
  Object.fromEntries(
    Object.values(EDIT_BAR_CANON_GROUPS)
      .flat()
      .map((item) => [item.id, item]),
  ) as Record<EditBarCanonId, EditBarCanonEntry>;

export function isEditBarCanonId(id: string): id is EditBarCanonId {
  return Object.prototype.hasOwnProperty.call(EDIT_BAR_CANON, id);
}

/** 下拉规范项的选项值与中文标签（`align` / `list` / `arrange`）。 */
export const EDIT_BAR_CANON_OPTIONS = {
  align: [
    { value: "left", label: "左对齐", icon: "align-left" },
    { value: "center", label: "居中", icon: "align-center" },
    { value: "right", label: "右对齐", icon: "align-right" },
    { value: "justify", label: "两端对齐", icon: "align-justify" },
  ],
  list: [
    { value: "none", label: "无列表", icon: "text" },
    { value: "bullet", label: "项目符号列表", icon: "list" },
    { value: "ordered", label: "编号列表", icon: "list-ordered" },
  ],
  arrange: [
    { value: "front", label: "置于顶层", icon: "arrange" },
    { value: "forward", label: "前移一层", icon: "arrange" },
    { value: "backward", label: "后移一层", icon: "arrange" },
    { value: "back", label: "置于底层", icon: "arrange" },
  ],
} as const satisfies Readonly<
  Partial<
    Record<
      EditBarCanonId,
      ReadonlyArray<{ value: string; label: string; icon: SelectionControlIcon }>
    >
  >
>;

/** 锁定项在已锁定时的标签。 */
export const EDIT_BAR_UNLOCK_LABEL = "取消锁定";

/**
 * 别名：编辑器改成规范 id 之前，投影按这张表归一。`bars` 缺省 = 任何栏都认。
 * `color` 只在文字栏算文字色、在形状栏算填充（§4）。
 */
export interface EditBarCanonAlias {
  canon: EditBarCanonId;
  bars?: readonly SelectionBar[];
  /** 合成下拉：本 id 代表规范下拉的哪个选项（layer-up → arrange: forward）。 */
  option?: string;
}

export const EDIT_BAR_CANON_ALIASES: Readonly<Record<string, EditBarCanonAlias>> = {
  "font-panel": { canon: "font-family" },
  font: { canon: "font-family" },
  "text-font": { canon: "font-family" },
  color: { canon: "text-color", bars: ["text"] },
  "font-color": { canon: "text-color" },
  "text-fill": { canon: "text-color" },
  linethrough: { canon: "strike" },
  strikethrough: { canon: "strike" },
  "text-align": { canon: "align" },
  alignment: { canon: "align" },
  "bullet-list": { canon: "list", option: "bullet" },
  "ordered-list": { canon: "list", option: "ordered" },
  "line-spacing": { canon: "line-height" },
  "char-spacing": { canon: "letter-spacing" },
  "text-case": { canon: "case" },
  "writing-mode": { canon: "vertical-text" },
  "replace-panel": { canon: "replace" },
  "replace-image": { canon: "replace" },
  "flip-horizontal": { canon: "flip-x" },
  "flip-vertical": { canon: "flip-y" },
  "rotate-right": { canon: "rotate" },
  "rotate-cw": { canon: "rotate" },
  "border-radius": { canon: "radius" },
  "corner-radius": { canon: "radius" },
  "filter-panel": { canon: "adjust" },
  "adjust-panel": { canon: "adjust" },
  "layer-up": { canon: "arrange", option: "forward" },
  "bring-forward": { canon: "arrange", option: "forward" },
  "layer-down": { canon: "arrange", option: "backward" },
  "send-backward": { canon: "arrange", option: "backward" },
  "bring-to-front": { canon: "arrange", option: "front" },
  "layer-top": { canon: "arrange", option: "front" },
  "send-to-back": { canon: "arrange", option: "back" },
  "layer-bottom": { canon: "arrange", option: "back" },
  "animation-gallery": { canon: "animation" },
};

/** 形状栏里 `color` 是填充；描边色在形状栏算描边、在图片栏算边框。 */
const BAR_SCOPED_ALIASES: Readonly<
  Partial<Record<SelectionBar, Readonly<Record<string, EditBarCanonId>>>>
> = {
  // `stroke-color` / `border-width` 这类是面板子控件（§4 增补 A-1），不在这里归一成顶层项。
  shape: { color: "fill", "border-color": "stroke" },
  image: { "border-color": "border" },
};

/**
 * 一个控件在这条栏里算哪个规范 id；`undefined` = 编辑器特有控件。
 * 规范 id 本身优先于别名。
 */
export function resolveEditBarCanonId(
  control: Pick<SelectionControl, "id">,
  bar: SelectionBar,
): EditBarCanonId | undefined {
  const id = control.id.toLowerCase();
  if (isEditBarCanonId(id)) return id;
  const scoped = BAR_SCOPED_ALIASES[bar]?.[id];
  if (scoped) return scoped;
  const alias = EDIT_BAR_CANON_ALIASES[id];
  if (!alias) return undefined;
  if (alias.bars && !alias.bars.includes(bar)) return undefined;
  return alias.canon;
}

const TEXT_KIND = /(^|[-_])(text|textbox|i-?text|paragraph|heading|title|caption|subtitle|cell|rich-?doc|doc|word|span|typography)([-_]|$)/;
const IMAGE_KIND = /(^|[-_])(image|img|photo|picture|bitmap|sticker|logo)([-_]|$)/;
const SHAPE_KIND = /(^|[-_])(shape|rect|rectangle|circle|ellipse|line|arrow|path|polygon|star|triangle|diamond|hexagon)([-_]|$)/;

/** 没有 `bar` 时按 `kind` 推断；`kind` 认不出再看控件里哪一组规范项最多。 */
export function inferSelectionBar(
  context: Pick<SelectionContext, "kind" | "controls" | "bar">,
): SelectionBar {
  if (context.bar) return context.bar;
  const kind = context.kind.toLowerCase();
  if (TEXT_KIND.test(kind)) return "text";
  if (IMAGE_KIND.test(kind)) return "image";
  if (SHAPE_KIND.test(kind)) return "shape";
  const votes: Record<"text" | "image" | "shape", number> = {
    text: 0,
    image: 0,
    shape: 0,
  };
  for (const control of context.controls) {
    for (const group of ["text", "image", "shape"] as const) {
      const id = resolveEditBarCanonId(control, group);
      if (id && EDIT_BAR_CANON_GROUPS[group].some((item) => item.id === id)) {
        votes[group] += 1;
      }
    }
  }
  const best = (["text", "image", "shape"] as const).reduce((left, right) =>
    votes[right] > votes[left] ? right : left,
  );
  return votes[best] > 0 ? best : "object";
}

/** 一条栏的分组顺序：本组 → 其余类型组 → 对象组。文字栏里形状组排在图片组前（§4 规则一）。 */
export function editBarGroupOrder(bar: SelectionBar): readonly EditBarCanonGroup[] {
  switch (bar) {
    case "text":
      return ["text", "shape", "image", "object"];
    case "image":
      return ["image", "shape", "text", "object"];
    case "shape":
      return ["shape", "text", "image", "object"];
    default:
      return ["text", "image", "shape", "object"];
  }
}

/** 这条栏里规范项的全序（主栏项在前、「更多」项在后，按组展开；共用项取首次出现）。 */
export function editBarCanonSequence(bar: SelectionBar): readonly {
  id: EditBarCanonId;
  group: EditBarCanonGroup;
}[] {
  const seen = new Set<EditBarCanonId>();
  const sequence: { id: EditBarCanonId; group: EditBarCanonGroup }[] = [];
  for (const group of editBarGroupOrder(bar)) {
    for (const item of EDIT_BAR_CANON_GROUPS[group]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      sequence.push({ id: item.id, group });
    }
  }
  return sequence;
}

/** 规范项占用的字形：编辑器特有控件不许借用（`strike` 与旧名 `linethrough` 同形）。 */
export const EDIT_BAR_CANON_ICON_CLASSES: Readonly<Record<string, string>> = {
  linethrough: "strike",
  spacing: "line-height",
  "underline-color": "text-color",
  transparency: "opacity",
  "align-center": "align-left",
  "align-right": "align-left",
  "align-justify": "align-left",
  "list-ordered": "list",
  unlock: "lock",
  "bring-forward": "arrange",
  "send-backward": "arrange",
};

/**
 * 编辑器特有控件里有现成的、不撞规范图标的独立字形：直接换上，不必退成文字。
 * （向左旋转 90° 原来借用规范 `rotate` 的顺时针字形。）
 */
export const EDIT_BAR_SPECIFIC_ICONS: Readonly<Record<string, SelectionControlIcon>> = {
  "rotate-left": "rotate-ccw",
  "rotate-ccw": "rotate-ccw",
};

export function editBarIconClass(icon: string): string {
  return EDIT_BAR_CANON_ICON_CLASSES[icon] || icon;
}

export const EDIT_BAR_CANON_ICON_SET: ReadonlySet<string> = new Set(
  Object.values(EDIT_BAR_CANON).map((item) => editBarIconClass(item.icon)),
);
