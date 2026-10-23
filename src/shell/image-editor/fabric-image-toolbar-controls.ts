import type { UITranslate } from "../../i18n/ui/useUI";
import type {
  SelectionBar,
  SelectionControl,
  SelectionControlOption,
} from "../selection-context-types";
import { textListMode } from "./fabric-style-ops";
import type {
  CropRatio,
  FilterSettings,
  SelectedSnapshot,
  TextSettings,
  TransformInfo,
} from "./types";

/**
 * 图片编辑器的选区控件（2026-10-23 统一编辑栏 D9，词表 `00-dispatch.md` §4 + 增补 A-1）。
 *
 * 只出规范 id；图标、标签、顺序由外壳投影统一给。面板型规范项（`position`
 * `stroke` `border` `adjust`）只发子控件，`inspectorGroup` 就是规范 id。
 * 引擎做不到的规范项不出（`link` `vertical-text` `indent-*` `alt`
 * `remove-background` `animation`）。特有控件：裁剪态的应用 / 取消 / 比例，
 * 表格的行列与配色，不带规范图标。
 */
export interface FabricImageToolbarBuildInput {
  selected: SelectedSnapshot | null;
  cropping: boolean;
  cropRatio: CropRatio;
  loading: boolean;
  /** First source load. Save must not send false. */
  sourceReady?: boolean;
  /** Persist in flight. Must not disable the bar. */
  saving?: boolean;
  transformInfo: TransformInfo | null;
  filters: FilterSettings | null | undefined;
  layers: readonly { locked: boolean }[];
  /** 字体下拉的候选（值 = CSS font-family，标签 = 字体名）。 */
  fonts?: readonly SelectionControlOption[];
  tt: UITranslate;
}

type EditorToolbarBag = {
  selected?: SelectedSnapshot | null;
  cropping?: boolean;
  cropRatio?: CropRatio;
  loading?: boolean;
  sourceReady?: boolean;
  saving?: boolean;
  transformInfo?: TransformInfo | null;
  filterInfo?: { settings?: FilterSettings | null } | null;
  layers?: readonly { locked: boolean }[];
};

function normalizeToolbarInput(
  input: FabricImageToolbarBuildInput | { editor: EditorToolbarBag; tt: UITranslate },
): FabricImageToolbarBuildInput {
  if ("editor" in input) {
    const editor = input.editor;
    return {
      selected: editor.selected ?? null,
      cropping: Boolean(editor.cropping),
      cropRatio: editor.cropRatio || "free",
      loading: Boolean(editor.loading),
      sourceReady: editor.sourceReady !== false,
      saving: Boolean(editor.saving),
      transformInfo: editor.transformInfo ?? null,
      filters: editor.filterInfo?.settings ?? null,
      layers: editor.layers ?? [],
      tt: input.tt,
    };
  }
  return input;
}

const LINE_KINDS = new Set([
  "line",
  "dashed-line",
  "curve",
  "arrow",
  "elbow-arrow",
  "double-arrow",
  "path",
]);

/** Compact primary row: omitted/`primary`. Inspector overflow is `more`. */
export function isPrimaryImageToolbarControl(
  control: Pick<SelectionControl, "placement">,
): boolean {
  return control.placement !== "more" && control.placement !== "tools";
}

export function primaryImageToolbarControlIds(
  controls: readonly SelectionControl[],
): string[] {
  return controls.filter(isPrimaryImageToolbarControl).map((control) => control.id);
}

function isImageSelection(selected: SelectedSnapshot): boolean {
  return selected.kind === "image" || selected.kind === "background";
}

/** 这条选区出哪一条统一栏（`SelectionContext.bar`）。 */
export function fabricImageSelectionBar(
  selected: SelectedSnapshot | null,
  cropping = false,
): SelectionBar {
  if (!selected) return "object";
  if (cropping || isImageSelection(selected)) return "image";
  if (selected.text) return "text";
  if (selected.table) return "object";
  return "shape";
}

const CROP_RATIO_OPTIONS = (tt: UITranslate): SelectionControlOption[] => [
  { value: "free", label: tt("自由") },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];

function inspector(group: string, label: string) {
  return { slot: "inspector" as const, inspectorGroup: group, inspectorLabel: label };
}

function fontOptions(
  current: string,
  fonts: readonly SelectionControlOption[],
): SelectionControlOption[] {
  if (!current || fonts.some((font) => font.value === current)) return [...fonts];
  const name = current.split(",")[0].replace(/["']/g, "").trim() || current;
  return [{ value: current, label: name }, ...fonts];
}

function textControls(
  text: TextSettings,
  fonts: readonly SelectionControlOption[],
  tt: UITranslate,
): SelectionControl[] {
  return [
    {
      id: "text",
      kind: "text",
      label: tt("文字内容"),
      value: text.value,
      placement: "more",
      ...inspector("image-text-content", tt("文字内容")),
    },
    {
      id: "font-family",
      kind: "select",
      label: tt("字体"),
      value: text.fontFamily,
      options: fontOptions(text.fontFamily, fonts),
    },
    {
      id: "font-size",
      kind: "number",
      label: tt("字号"),
      value: text.fontSize,
      min: 6,
      max: 320,
      step: 0.1,
    },
    { id: "bold", kind: "toggle", label: tt("粗体"), value: text.bold },
    { id: "italic", kind: "toggle", label: tt("斜体"), value: text.italic },
    { id: "underline", kind: "toggle", label: tt("下划线"), value: text.underline },
    { id: "strike", kind: "toggle", label: tt("删除线"), value: text.linethrough },
    {
      id: "text-color",
      kind: "color",
      label: tt("文字色"),
      value: text.fill || "#000000",
    },
    {
      id: "highlight",
      kind: "color",
      label: tt("高亮色"),
      value: text.highlight || "",
    },
    {
      id: "align",
      kind: "select",
      label: tt("对齐"),
      value: text.align,
      options: [
        { value: "left", label: tt("左对齐") },
        { value: "center", label: tt("居中") },
        { value: "right", label: tt("右对齐") },
        { value: "justify", label: tt("两端对齐") },
      ],
    },
    {
      id: "list",
      kind: "select",
      label: tt("列表"),
      value: textListMode(text.value),
      options: [
        { value: "none", label: tt("无列表") },
        { value: "bullet", label: tt("项目符号列表") },
        { value: "ordered", label: tt("编号列表") },
      ],
    },
    {
      id: "line-height",
      kind: "number",
      label: tt("行距"),
      value: text.lineHeight,
      min: 0.5,
      max: 4,
      step: 0.05,
    },
    {
      id: "letter-spacing",
      kind: "number",
      label: tt("字距"),
      value: text.charSpacing,
      min: -200,
      max: 1_000,
      step: 10,
      placement: "more",
    },
    { id: "case", kind: "action", label: tt("更改大小写"), placement: "more" },
    { id: "clear-format", kind: "action", label: tt("清除样式"), placement: "more" },
    // 形状组里适用于文字的：文字描边。
    {
      id: "stroke-color",
      kind: "color",
      label: tt("描边颜色"),
      value: text.stroke || "#000000",
      ...inspector("stroke", tt("描边")),
    },
    {
      id: "stroke-width",
      kind: "range",
      label: tt("描边粗细"),
      value: text.strokeWidth,
      min: 0,
      max: 30,
      step: 1,
      ...inspector("stroke", tt("描边")),
    },
  ];
}

function imageControls(
  selected: SelectedSnapshot,
  filters: FilterSettings | null | undefined,
  tt: UITranslate,
): SelectionControl[] {
  const adjust = inspector("adjust", tt("调色"));
  const controls: SelectionControl[] = [
    {
      id: "replace",
      kind: "panel",
      label: tt("替换"),
      panelId: "materials",
      panelAction: "replace",
    },
    { id: "crop", kind: "action", label: tt("裁剪") },
    { id: "flip-x", kind: "action", label: tt("水平翻转") },
    { id: "flip-y", kind: "action", label: tt("垂直翻转") },
    { id: "rotate", kind: "action", label: tt("向右旋转 90°") },
    {
      id: "radius",
      kind: "range",
      label: tt("圆角"),
      value: selected.radius ?? 0,
      min: 0,
      max: 300,
      step: 1,
    },
    {
      id: "border-color",
      kind: "color",
      label: tt("边框颜色"),
      value: selected.stroke || "#000000",
      ...inspector("border", tt("边框")),
    },
    {
      id: "border-width",
      kind: "range",
      label: tt("边框粗细"),
      value: selected.strokeWidth,
      min: 0,
      max: 30,
      step: 1,
      ...inspector("border", tt("边框")),
    },
  ];
  if (filters) {
    const ranges: [keyof FilterSettings, string, number, number][] = [
      ["brightness", "亮度", -100, 100],
      ["contrast", "对比度", -100, 100],
      ["saturation", "饱和度", -100, 100],
      ["blur", "模糊", 0, 100],
      ["pixelate", "像素化", 0, 100],
    ];
    for (const [key, label, min, max] of ranges) {
      controls.push({
        id: key,
        kind: "range",
        label: tt(label),
        value: Number(filters[key]) || 0,
        min,
        max,
        step: 1,
        ...adjust,
      });
    }
    for (const [key, label] of [
      ["grayscale", "黑白"],
      ["sepia", "复古"],
      ["invert", "反相"],
    ] as const) {
      controls.push({
        id: key,
        kind: "toggle",
        label: tt(label),
        value: filters[key],
        ...adjust,
      });
    }
    controls.push({ id: "filter-reset", kind: "action", label: tt("重置调整"), ...adjust });
  }
  controls.push({
    id: "image-fit",
    kind: "select",
    label: tt("显示方式"),
    value: selected.imageFit || "fill",
    placement: "more",
    options: [
      { value: "contain", label: tt("完整显示") },
      { value: "cover", label: tt("填满裁剪") },
      { value: "fill", label: tt("拉伸填满") },
    ],
  });
  return controls;
}

function shapeControls(selected: SelectedSnapshot, tt: UITranslate): SelectionControl[] {
  const lineLike = LINE_KINDS.has(selected.kind);
  const controls: SelectionControl[] = [];
  if (!lineLike) {
    controls.push({
      id: "fill",
      kind: "color",
      label: tt("填充"),
      value: selected.fill || "#000000",
    });
  }
  if (selected.kind !== "note") {
    const stroke = inspector("stroke", tt("描边"));
    controls.push(
      {
        id: "stroke-color",
        kind: "color",
        label: lineLike ? tt("线条颜色") : tt("描边颜色"),
        value: selected.stroke || selected.fill || "#000000",
        ...stroke,
      },
      {
        id: "stroke-width",
        kind: "range",
        label: lineLike ? tt("线条粗细") : tt("描边粗细"),
        value: selected.strokeWidth,
        min: 0,
        max: 30,
        step: 1,
        ...stroke,
      },
      {
        id: "stroke-dash",
        kind: "select",
        label: tt("线型"),
        value: selected.strokeDash || "solid",
        options: [
          { value: "solid", label: tt("实线") },
          { value: "dashed", label: tt("虚线") },
          { value: "dotted", label: tt("点线") },
        ],
        ...stroke,
      },
    );
  }
  if (selected.radius !== null && selected.radius !== undefined) {
    controls.push({
      id: "radius",
      kind: "range",
      label: tt("圆角"),
      value: selected.radius,
      min: 0,
      max: 300,
      step: 1,
    });
  }
  return controls;
}

function tableControls(
  table: NonNullable<SelectedSnapshot["table"]>,
  tt: UITranslate,
): SelectionControl[] {
  const structure = inspector("image-table-structure", tt("表格结构"));
  const style = inspector("image-table-style", tt("表格样式"));
  return [
    { id: "table-rows", kind: "number", label: tt("行"), value: table.rows, min: 1, max: 20, step: 1, ...structure },
    { id: "table-columns", kind: "number", label: tt("列"), value: table.columns, min: 1, max: 20, step: 1, ...structure },
    { id: "table-header-fill", kind: "color", label: tt("表头"), value: table.style.headerFill, ...style },
    { id: "table-body-fill", kind: "color", label: tt("单元格"), value: table.style.bodyFill, ...style },
    { id: "table-text-color", kind: "color", label: tt("表格文字色"), value: table.style.textColor, ...style },
    { id: "table-border-color", kind: "color", label: tt("表格线颜色"), value: table.style.borderColor, ...style },
    { id: "table-border-width", kind: "range", label: tt("表格线粗细"), value: table.style.borderWidth, min: 0, max: 20, step: 1, ...style },
  ];
}

function objectControls(selected: SelectedSnapshot, tt: UITranslate): SelectionControl[] {
  const position = inspector("position", tt("位置与尺寸"));
  const isBackground = selected.kind === "background";
  const controls: SelectionControl[] = [
    { id: "opacity", kind: "range", label: tt("透明度"), value: selected.opacity, min: 0, max: 100, step: 1 },
    {
      id: "shadow",
      kind: "toggle",
      label: tt("投影"),
      value: selected.shadow.enabled,
      placement: "more",
    },
  ];
  if (!isBackground) {
    controls.push({
      id: "arrange",
      kind: "select",
      label: tt("层级"),
      value: "",
      options: [
        { value: "front", label: tt("置于顶层") },
        { value: "forward", label: tt("前移一层") },
        { value: "backward", label: tt("后移一层") },
        { value: "back", label: tt("置于底层") },
      ],
    });
  }
  controls.push(
    { id: "position-x", kind: "number", label: "X", value: selected.x, step: 1, ...position },
    { id: "position-y", kind: "number", label: "Y", value: selected.y, step: 1, ...position },
    { id: "object-width", kind: "number", label: tt("宽"), value: selected.width, min: 1, step: 1, ...position },
    { id: "object-height", kind: "number", label: tt("高"), value: selected.height, min: 1, step: 1, ...position },
    { id: "angle", kind: "number", label: tt("角度"), value: selected.angle, min: 0, max: 359, step: 1, ...position },
  );
  if (!isImageSelection(selected)) {
    // 图片组自己有翻转按钮；文字、形状的翻转放在位置面板里，不借用翻转图标上栏。
    controls.push(
      { id: "position-flip-x", kind: "action", label: tt("水平翻转"), ...position },
      { id: "position-flip-y", kind: "action", label: tt("垂直翻转"), ...position },
    );
  }
  controls.push(
    { id: "lock", kind: "toggle", label: tt("锁定"), value: selected.locked },
    { id: "duplicate", kind: "action", label: tt("复制") },
    { id: "delete", kind: "action", label: tt("删除"), danger: true },
  );
  return controls;
}

export function buildFabricImageToolbarControls(
  input: FabricImageToolbarBuildInput | { editor: EditorToolbarBag; tt: UITranslate },
): SelectionControl[] {
  const fields = normalizeToolbarInput(input);
  const { selected, tt } = fields;
  // 源图还没载入时画布没有可编辑对象：不出一条灰栏。
  if (!selected || fields.sourceReady === false) return [];

  // During crop the active Fabric object is the temporary crop rectangle,
  // whose kind is `rect`. Keep the crop session's controls independent of
  // the selected snapshot kind so Apply, Cancel and ratio remain reachable.
  if (fields.cropping) {
    return [
      { id: "crop-apply", kind: "action", label: tt("应用裁剪"), iconOnly: false },
      {
        id: "crop-ratio",
        kind: "select",
        label: tt("裁剪比例"),
        value: fields.cropRatio,
        options: CROP_RATIO_OPTIONS(tt),
      },
      { id: "crop-cancel", kind: "action", label: tt("取消裁剪"), iconOnly: false },
    ];
  }

  // 锁定的图层只剩「解锁」：别的按钮点了也不会生效，不摆出来。
  if (selected.locked) {
    return [{ id: "lock", kind: "toggle", label: tt("锁定"), value: true }];
  }

  const fonts = fields.fonts ?? [];
  const controls: SelectionControl[] = [];
  if (isImageSelection(selected)) {
    controls.push(...imageControls(selected, fields.filters, tt));
  } else if (selected.text) {
    controls.push(...textControls(selected.text, fonts, tt));
  } else if (selected.table) {
    controls.push(...tableControls(selected.table, tt));
  } else {
    controls.push(...shapeControls(selected, tt));
  }
  controls.push(...objectControls(selected, tt));
  return controls;
}
