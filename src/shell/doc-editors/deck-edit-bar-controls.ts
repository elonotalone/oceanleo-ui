/**
 * 演示选中对象的统一编辑栏（2026-10-23 D9，词表 `00-dispatch.md` §4 + 增补 A-1）。
 *
 * 只出规范 id，顺序即规范顺序：文字框 = 文字组 → 形状组里适用的项 → 对象组；
 * 图片 = 图片组 → 对象组；形状 = 形状组 → 对象组。面板型规范项（position /
 * stroke / border / adjust / animation / opacity / link / alt）发子控件，
 * `slot:"inspector"` + `inspectorGroup:<规范 id>`。做不到的项不出；
 * 锁定的对象只剩「取消锁定」与替代文字，其余不出（不放灰按钮）。
 */
import type { UITranslate } from "../../i18n/ui/useUI";
import {
  EDIT_BAR_CANON,
  EDIT_BAR_CANON_OPTIONS,
  type EditBarCanonId,
  type SelectionBar,
} from "../edit-bar-canon";
import type { SelectionControl } from "../selection-context";
import type { DeckElement } from "./deck-schema";

type Control = SelectionControl;

function familyKey(family: string): string {
  return family.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
}

export interface DeckFontChoice {
  family: string;
  label: string;
}

/**
 * 字体下拉：共享字体表（`ADVANCED_EDITOR_FONTS`，由组件层传入，这里保持纯 TS）；
 * 文稿里的字体不在表中时排第一个，显示它自己的名字。
 */
export function deckFontOptions(
  current: string | undefined,
  inherited: string,
  fonts: readonly DeckFontChoice[],
): { value: string; options: { value: string; label: string }[] } {
  const options = fonts.map((font) => ({
    value: font.family,
    label: font.label,
  }));
  const family = (current || inherited || "").trim();
  if (!family) return { value: options[0]?.value || "", options };
  const match = options.find((option) => familyKey(option.value) === familyKey(family));
  if (match) return { value: match.value, options };
  const label = family.split(",")[0].trim().replace(/^["']|["']$/g, "");
  return { value: family, options: [{ value: family, label }, ...options] };
}

export function deckElementBar(element: DeckElement): SelectionBar {
  if (element.type === "text" || element.type === "table") return "text";
  if (element.type === "image") return "image";
  if (element.type === "shape") return "shape";
  return "object";
}

export function deckElementSelectionControls(
  element: DeckElement,
  tt: UITranslate,
  inheritedFont = "",
  fonts: readonly DeckFontChoice[] = [],
): Control[] {
  const canon = (id: EditBarCanonId) => ({
    id,
    icon: EDIT_BAR_CANON[id].icon,
    label: tt(EDIT_BAR_CANON[id].label),
  });
  const choices = (id: keyof typeof EDIT_BAR_CANON_OPTIONS) =>
    EDIT_BAR_CANON_OPTIONS[id].map((option) => ({
      value: option.value,
      label: tt(option.label),
    }));
  const panel = (group: EditBarCanonId) => ({
    slot: "inspector" as const,
    inspectorGroup: group,
    inspectorLabel: tt(EDIT_BAR_CANON[group].label),
    inspectorIcon: EDIT_BAR_CANON[group].icon,
    ...(EDIT_BAR_CANON[group].tier === "more" ? { placement: "more" as const } : {}),
  });
  const more = { placement: "more" as const };
  const toggle = (id: EditBarCanonId, value: boolean): Control => ({
    ...canon(id),
    kind: "toggle",
    iconOnly: true,
    value,
  });
  const action = (id: EditBarCanonId, extra: Partial<Control> = {}): Control => ({
    ...canon(id),
    kind: "action",
    iconOnly: true,
    ...extra,
  });
  const range = (
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    group: EditBarCanonId,
  ): Control => ({ id, kind: "range", label, value, min, max, step, ...panel(group) });
  const locked = Boolean(element.locked);
  const lock: Control = {
    ...canon("lock"),
    kind: "toggle",
    iconOnly: true,
    value: locked,
    label: locked ? tt("取消锁定") : tt(EDIT_BAR_CANON.lock.label),
    icon: locked ? "unlock" : "lock",
  };
  const alt: Control = {
    id: "alt",
    kind: "text",
    label: tt("替代文字"),
    value: element.alt || "",
    ...panel("alt"),
  };
  if (locked) return element.type === "image" ? [lock, alt] : [lock];

  const opacity = range("opacity", tt("透明度"), element.opacity ?? 1, 0, 1, 0.05, "opacity");
  const shadow = { ...toggle("shadow", element.shadow === true), ...more };
  const radius: Control = {
    ...canon("radius"),
    kind: "number",
    value: element.borderRadius || 0,
    min: 0,
    max: 999,
    step: 1,
  };
  const fill: Control = {
    ...canon("fill"),
    kind: "color",
    iconOnly: true,
    value: element.fill || "",
  };
  const strokeColor = (value: string): Control => ({
    id: "stroke-color",
    kind: "color",
    label: tt("描边"),
    value,
    ...panel("stroke"),
  });
  const strokeWidth = (min: number, fallback: number): Control => ({
    id: "stroke-width",
    kind: "number",
    label: tt("粗细"),
    value: element.borderWidth ?? fallback,
    min,
    max: element.shape === "line" ? 24 : 40,
    step: 1,
    ...panel("stroke"),
  });

  const text: Control[] = [];
  if (element.type === "text" || element.type === "table") {
    const font = deckFontOptions(element.fontFamily, inheritedFont, fonts);
    if (element.type === "text" && font.options.length) {
      text.push({
        ...canon("font-family"),
        kind: "select",
        value: font.value,
        options: font.options,
      });
    }
    text.push(
      {
        ...canon("font-size"),
        kind: "number",
        value: element.fontSize || (element.type === "table" ? 16 : 18),
        min: element.type === "table" ? 6 : 4,
        max: element.type === "table" ? 72 : 300,
        step: 1,
      },
      toggle("bold", element.bold === true),
      toggle("italic", element.italic === true),
      toggle("underline", element.underline === true),
      toggle("strike", element.strike === true),
      {
        ...canon("text-color"),
        kind: "color",
        iconOnly: true,
        value: element.color || (element.type === "table" ? "#292524" : "#111827"),
      },
    );
    if (element.type === "text") {
      text.push(
        { ...canon("highlight"), kind: "color", iconOnly: true, value: element.highlight || "" },
        {
          ...canon("align"),
          kind: "select",
          iconOnly: true,
          value: element.align || "left",
          options: choices("align"),
        },
        {
          ...canon("list"),
          kind: "select",
          iconOnly: true,
          value: element.list || "none",
          options: choices("list"),
        },
        {
          ...canon("line-height"),
          kind: "number",
          value: element.lineHeight || 1.15,
          min: 0.7,
          max: 4,
          step: 0.05,
        },
        { id: "link", kind: "text", label: tt("链接地址"), value: element.link || "", ...panel("link") },
        {
          ...canon("letter-spacing"),
          kind: "number",
          value: element.letterSpacing || 0,
          min: -10,
          max: 40,
          step: 0.5,
          ...more,
        },
        { ...action("clear-format"), ...more },
      );
    }
  }

  const typeGroup: Control[] = [];
  if (element.type === "text") {
    typeGroup.push(
      ...text,
      fill,
      strokeColor(element.borderColor || "#000000"),
      strokeWidth(0, 0),
      radius,
      opacity,
      shadow,
    );
  } else if (element.type === "table") {
    typeGroup.push(
      ...text,
      { ...fill, value: element.fill || "#ffffff" },
      strokeColor(element.borderColor || "#d6d3d1"),
      strokeWidth(0, 1),
      opacity,
    );
  } else if (element.type === "image") {
    typeGroup.push(
      { ...canon("replace"), kind: "panel", iconOnly: true, panelId: "materials", panelAction: "replace" },
      action("flip-x"),
      action("flip-y"),
      action("rotate"),
      radius,
      { id: "border-color", kind: "color", label: tt("边框"), value: element.borderColor || "#000000", ...panel("border") },
      { id: "border-width", kind: "number", label: tt("粗细"), value: element.borderWidth || 0, min: 0, max: 40, step: 1, ...panel("border") },
      opacity,
      range("brightness", tt("亮度"), element.brightness ?? 1, 0, 2, 0.05, "adjust"),
      range("contrast", tt("对比度"), element.contrast ?? 1, 0, 2, 0.05, "adjust"),
      range("saturation", tt("饱和度"), element.saturation ?? 1, 0, 2, 0.05, "adjust"),
      range("blur", tt("模糊"), element.blur ?? 0, 0, 20, 0.5, "adjust"),
      { id: "adjust-reset", kind: "action", label: tt("重置调整"), ...panel("adjust") },
      alt,
      {
        ...canon("image-fit"),
        kind: "select",
        value: element.imageFit || "contain",
        options: [
          { value: "contain", label: tt("完整显示") },
          { value: "cover", label: tt("填满裁剪") },
          { value: "fill", label: tt("拉伸填满") },
        ],
        ...more,
      },
      shadow,
    );
  } else if (element.type === "shape") {
    const line = element.shape === "line";
    const lineColor =
      element.borderColor && element.borderColor !== "transparent"
        ? element.borderColor
        : element.fill || "#111827";
    if (!line) typeGroup.push({ ...fill, value: element.fill || "#ffffff" });
    typeGroup.push(
      strokeColor(line ? lineColor : element.borderColor || "#000000"),
      strokeWidth(line ? 1 : 0, line ? 3 : 0),
    );
    if (line) {
      const marker = (id: string, label: string, value: string): Control => ({
        id,
        kind: "select",
        label,
        value,
        options: [
          { value: "none", label: tt("无") },
          { value: "arrow", label: tt("箭头") },
          { value: "circle", label: tt("圆点") },
          { value: "diamond", label: tt("菱形") },
        ],
        ...panel("stroke"),
      });
      typeGroup.push(
        {
          id: "stroke-dash",
          kind: "select",
          label: tt("线型"),
          value: element.lineDash || "solid",
          options: [
            { value: "solid", label: tt("实线") },
            { value: "dash", label: tt("虚线") },
            { value: "dot", label: tt("点线") },
          ],
          ...panel("stroke"),
        },
        marker("line-start", tt("起点"), element.lineStart || "none"),
        marker("line-end", tt("终点"), element.lineEnd || "none"),
      );
    }
    if (element.shape === "rectangle" || element.shape === "rounded") typeGroup.push(radius);
    typeGroup.push(opacity);
    if (!line) typeGroup.push(shadow);
  }

  const geometry = (id: string, label: string, value: number, suffix?: string): Control => ({
    id,
    kind: "number",
    label,
    value,
    ...(suffix ? { suffix } : {}),
    ...panel("position"),
  });
  const animation = element.animation;
  const objectGroup: Control[] = [
    {
      ...canon("arrange"),
      kind: "select",
      iconOnly: true,
      value: "",
      options: choices("arrange"),
    },
    geometry("x", "X", element.x, "%"),
    geometry("y", "Y", element.y, "%"),
    geometry("width", tt("宽"), element.width, "%"),
    geometry("height", tt("高"), element.height, "%"),
    geometry("rotation", tt("旋转"), element.rotation),
    {
      id: "animation-type",
      kind: "select",
      label: tt("进入动画"),
      value: animation?.type || "none",
      options: [
        { value: "none", label: tt("无") },
        { value: "fade", label: tt("淡入") },
        { value: "fly-up", label: tt("向上飞入") },
        { value: "wipe", label: tt("擦除") },
        { value: "zoom", label: tt("缩放") },
      ],
      ...panel("animation"),
    },
    ...(animation
      ? [
          range("animation-duration", tt("动画时长"), animation.durationMs, 100, 3_000, 50, "animation"),
          range("animation-delay", tt("延迟"), animation.delayMs, 0, 10_000, 50, "animation"),
        ]
      : []),
    lock,
    action("duplicate"),
    action("delete", { danger: true }),
  ];
  const specific: Control[] =
    element.type === "shape"
      ? [
          {
            id: "shape",
            kind: "select",
            label: tt("形状"),
            value: element.shape || "rectangle",
            options: [
              { value: "rectangle", label: tt("矩形") },
              { value: "rounded", label: tt("圆角矩形") },
              { value: "circle", label: tt("圆形") },
              { value: "triangle", label: tt("三角形") },
              { value: "diamond", label: tt("菱形") },
              { value: "star", label: tt("星形") },
              { value: "arrow", label: tt("箭头") },
              { value: "hexagon", label: tt("六边形") },
              { value: "line", label: tt("线条") },
            ],
            ...more,
          },
        ]
      : [];
  return [...typeGroup, ...objectGroup, ...specific];
}
