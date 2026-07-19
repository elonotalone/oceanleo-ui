"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionControl,
  SelectionContext,
} from "../selection-context";
import { deckSlideSelectionContext } from "./deck-slide-selection-context";
import { applyDeckToolbarCommand } from "./deck-toolbar-command";
import { deckElementAnimationControls } from "./deck-element-animation-controls";
import { deckToolbarControlAllowed } from "./DeckMutationPolicy";
import type { DeckEditorState } from "./use-deck-editor";

export function DeckContextToolbar({
  editor,
  accent = "#4f46e5",
}: {
  editor: DeckEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const element = editor.selectedElement;
  const slide = editor.activeSlide;
  const context = useMemo<SelectionContext | null>(() => {
    if (!element) return deckSlideSelectionContext(editor, tt);
    const common = [
      {
        id: "opacity",
        kind: "range" as const,
        label: tt("透明度"),
        icon: "opacity" as const,
        group: "appearance",
        value: element.opacity ?? 1,
        min: 0,
        max: 1,
        step: 0.05,
        slot: "inspector" as const,
        inspectorGroup: "deck-object-appearance",
        inspectorLabel: tt("外观"),
        inspectorIcon: "opacity" as const,
      },
      ...deckElementAnimationControls(element, tt),
      {
        id: "position-panel",
        kind: "panel" as const,
        label: tt("位置"),
        icon: "position" as const,
        group: "layout",
        panelId: "deck-layers",
      },
      {
        id: "lock",
        kind: "action" as const,
        label: element.locked ? tt("解锁") : tt("锁定"),
        icon: (element.locked ? "unlock" : "lock") as "unlock" | "lock",
        iconOnly: true,
        group: "object",
      },
      {
        id: "duplicate",
        kind: "action" as const,
        label: tt("复制"),
        icon: "duplicate" as const,
        iconOnly: true,
        group: "object",
      },
      {
        id: "delete",
        kind: "action" as const,
        label: tt("删除"),
        icon: "delete" as const,
        iconOnly: true,
        group: "object",
        danger: true,
      },
    ];
    return {
      version: 1,
      kind: `slide-${element.type}`,
      id: element.id,
      label:
        element.label ||
        element.alt ||
        tt(
          element.type === "text"
            ? "文字"
            : element.type === "image"
              ? "图片"
              : element.type === "shape"
                ? "形状"
                : "对象",
        ),
      controls: ([
        ...(element.type === "text"
          ? [
              {
                id: "text",
                kind: "text" as const,
                label: tt("文字内容"),
                value: element.text || "",
                slot: "inspector" as const,
                inspectorGroup: "deck-text-content",
                inspectorLabel: tt("文字内容"),
                inspectorIcon: "text" as const,
              },
              {
                id: "font-panel",
                kind: "panel" as const,
                label: element.fontFamily || tt("字体"),
                icon: "font" as const,
                group: "type",
                panelId: "deck-fonts",
              },
              {
                id: "font-size",
                kind: "number" as const,
                label: tt("字号"),
                group: "type",
                value: element.fontSize || 18,
                min: 4,
                max: 300,
                step: 1,
                slot: "inspector" as const,
                inspectorGroup: "deck-text-typography",
                inspectorLabel: tt("文字排版"),
                inspectorIcon: "font" as const,
              },
              {
                id: "color",
                kind: "color" as const,
                label: tt("文字色"),
                icon: "font" as const,
                iconOnly: true,
                group: "type",
                value: element.color || "#111827",
              },
              {
                id: "bold",
                kind: "toggle" as const,
                label: tt("粗体"),
                icon: "bold" as const,
                iconOnly: true,
                group: "style",
                value: element.bold === true,
              },
              {
                id: "italic",
                kind: "toggle" as const,
                label: tt("斜体"),
                icon: "italic" as const,
                iconOnly: true,
                group: "style",
                value: element.italic === true,
              },
              {
                id: "underline",
                kind: "toggle" as const,
                label: tt("下划线"),
                icon: "underline" as const,
                iconOnly: true,
                group: "style",
                value: element.underline === true,
              },
              {
                id: "align",
                kind: "select" as const,
                label: tt("对齐"),
                icon: "align-left" as const,
                iconOnly: true,
                group: "paragraph",
                value: element.align || "left",
                options: [
                  { value: "left", label: tt("左") },
                  { value: "center", label: tt("中") },
                  { value: "right", label: tt("右") },
                ],
              },
              {
                id: "line-height",
                kind: "number" as const,
                label: tt("行距"),
                icon: "spacing" as const,
                group: "paragraph",
                value: element.lineHeight || 1.15,
                min: 0.7,
                max: 4,
                step: 0.05,
                slot: "inspector" as const,
                inspectorGroup: "deck-text-spacing",
                inspectorLabel: tt("文字间距"),
                inspectorIcon: "spacing" as const,
              },
              {
                id: "letter-spacing",
                kind: "number" as const,
                label: tt("字距"),
                group: "paragraph",
                value: element.letterSpacing || 0,
                min: -10,
                max: 40,
                step: 0.5,
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "deck-text-spacing",
                inspectorLabel: tt("文字间距"),
                inspectorIcon: "spacing" as const,
              },
              {
                id: "effects-panel",
                kind: "panel" as const,
                label: tt("效果"),
                icon: "effects" as const,
                group: "effects",
                panelId: "deck-effects",
              },
            ]
          : []),
        ...(element.type === "shape"
          ? [
              ...(element.shape === "line"
                ? [
                    {
                      id: "border-color",
                      kind: "color" as const,
                      label: tt("线条颜色"),
                      icon: "border" as const,
                      group: "line",
                      value:
                        element.borderColor &&
                        element.borderColor !== "transparent"
                          ? element.borderColor
                          : element.fill || "#111827",
                    },
                    {
                      id: "border-width",
                      kind: "number" as const,
                      label: tt("粗细"),
                      group: "line",
                      value: element.borderWidth || 3,
                      min: 1,
                      max: 24,
                      step: 1,
                      slot: "inspector" as const,
                      inspectorGroup: "deck-line-style",
                      inspectorLabel: tt("线条样式"),
                      inspectorIcon: "line" as const,
                    },
                    {
                      id: "line-dash",
                      kind: "select" as const,
                      label: tt("线型"),
                      icon: "line" as const,
                      group: "line",
                      value: element.lineDash || "solid",
                      options: [
                        { value: "solid", label: tt("实线") },
                        { value: "dash", label: tt("虚线") },
                        { value: "dot", label: tt("点线") },
                      ],
                      slot: "inspector" as const,
                      inspectorGroup: "deck-line-style",
                      inspectorLabel: tt("线条样式"),
                      inspectorIcon: "line" as const,
                    },
                    {
                      id: "line-start",
                      kind: "select" as const,
                      label: tt("起点"),
                      group: "line-marker",
                      value: element.lineStart || "none",
                      options: [
                        { value: "none", label: tt("无") },
                        { value: "arrow", label: tt("箭头") },
                        { value: "circle", label: tt("圆点") },
                        { value: "diamond", label: tt("菱形") },
                      ],
                      slot: "inspector" as const,
                      inspectorGroup: "deck-line-markers",
                      inspectorLabel: tt("线条端点"),
                      inspectorIcon: "line" as const,
                    },
                    {
                      id: "line-end",
                      kind: "select" as const,
                      label: tt("终点"),
                      group: "line-marker",
                      value: element.lineEnd || "none",
                      options: [
                        { value: "none", label: tt("无") },
                        { value: "arrow", label: tt("箭头") },
                        { value: "circle", label: tt("圆点") },
                        { value: "diamond", label: tt("菱形") },
                      ],
                      slot: "inspector" as const,
                      inspectorGroup: "deck-line-markers",
                      inspectorLabel: tt("线条端点"),
                      inspectorIcon: "line" as const,
                    },
                  ]
                : [
                    {
                      id: "fill",
                      kind: "color" as const,
                      label: tt("填充"),
                      icon: "background" as const,
                      group: "shape",
                      value: element.fill || "#ffffff",
                    },
                  ]),
              {
                id: "shape",
                kind: "select" as const,
                label: tt("形状"),
                icon: "shape" as const,
                group: "shape",
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
              },
              ...(element.shape === "line"
                ? []
                : [
                    {
                      id: "border-color",
                      kind: "color" as const,
                      label: tt("描边"),
                      icon: "border" as const,
                      iconOnly: true,
                      group: "border",
                      value: element.borderColor || "#000000",
                    },
                    {
                      id: "border-width",
                      kind: "number" as const,
                      label: tt("描边"),
                      group: "border",
                      value: element.borderWidth || 0,
                      min: 0,
                      max: 40,
                      step: 1,
                      slot: "inspector" as const,
                      inspectorGroup: "deck-shape-border",
                      inspectorLabel: tt("描边与圆角"),
                      inspectorIcon: "border" as const,
                    },
                    {
                      id: "border-radius",
                      kind: "number" as const,
                      label: tt("圆角"),
                      group: "border",
                      value: element.borderRadius || 0,
                      min: 0,
                      max: 999,
                      step: 1,
                      slot: "inspector" as const,
                      inspectorGroup: "deck-shape-border",
                      inspectorLabel: tt("描边与圆角"),
                      inspectorIcon: "border" as const,
                    },
                  ]),
              {
                id: "shadow",
                kind: "toggle" as const,
                label: tt("阴影"),
                icon: "effects" as const,
                group: "effects",
                value: element.shadow === true,
              },
            ]
          : []),
        ...(element.type === "image"
          ? [
              {
                id: "replace-panel",
                kind: "panel" as const,
                label: tt("替换"),
                icon: "image" as const,
                group: "image",
                panelId: "materials",
                panelAction: "replace" as const,
              },
              {
                id: "image-fit",
                kind: "select" as const,
                label: tt("裁剪"),
                icon: "crop" as const,
                group: "image",
                value: element.imageFit || "contain",
                options: [
                  { value: "contain", label: tt("完整显示") },
                  { value: "cover", label: tt("填满裁剪") },
                  { value: "fill", label: tt("拉伸填满") },
                ],
              },
              {
                id: "alt",
                kind: "text" as const,
                label: tt("替代文字"),
                value: element.alt || "",
                slot: "inspector" as const,
                inspectorGroup: "deck-image-accessibility",
                inspectorLabel: tt("图片说明"),
                inspectorIcon: "image" as const,
              },
              {
                id: "filter-panel",
                kind: "panel" as const,
                label: tt("滤镜"),
                icon: "filter" as const,
                group: "image",
                panelId: "deck-effects",
              },
              {
                id: "flip-x",
                kind: "action" as const,
                label: tt("水平翻转"),
                icon: "flip-horizontal" as const,
                iconOnly: true,
                group: "transform",
              },
              {
                id: "flip-y",
                kind: "action" as const,
                label: tt("垂直翻转"),
                icon: "flip-vertical" as const,
                iconOnly: true,
                group: "transform",
              },
              {
                id: "border-radius",
                kind: "number" as const,
                label: tt("圆角"),
                group: "image",
                value: element.borderRadius || 0,
                min: 0,
                max: 999,
                step: 1,
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "deck-image-effects",
                inspectorLabel: tt("图片效果"),
                inspectorIcon: "effects" as const,
              },
              {
                id: "shadow",
                kind: "toggle" as const,
                label: tt("阴影"),
                icon: "effects" as const,
                group: "image",
                value: element.shadow === true,
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "deck-image-effects",
                inspectorLabel: tt("图片效果"),
                inspectorIcon: "effects" as const,
              },
            ]
          : []),
        ...(element.type === "table"
          ? [
              {
                id: "font-size",
                kind: "number" as const,
                label: tt("字号"),
                value: element.fontSize || 16,
                min: 6,
                max: 72,
                slot: "inspector" as const,
                inspectorGroup: "deck-table-style",
                inspectorLabel: tt("表格样式"),
                inspectorIcon: "table" as const,
              },
              {
                id: "color",
                kind: "color" as const,
                label: tt("文字色"),
                icon: "font" as const,
                value: element.color || "#292524",
              },
              {
                id: "fill",
                kind: "color" as const,
                label: tt("填充"),
                icon: "background" as const,
                value: element.fill || "#ffffff",
              },
            ]
          : []),
        ...common,
        {
          id: "x",
          kind: "number",
          label: "X",
          suffix: "%",
          value: element.x,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "deck-object-geometry",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
        {
          id: "y",
          kind: "number",
          label: "Y",
          suffix: "%",
          value: element.y,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "deck-object-geometry",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
        {
          id: "width",
          kind: "number",
          label: tt("宽") + " %",
          value: element.width,
          suffix: "%",
          placement: "more",
          slot: "inspector",
          inspectorGroup: "deck-object-geometry",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
        {
          id: "height",
          kind: "number",
          label: tt("高") + " %",
          value: element.height,
          suffix: "%",
          placement: "more",
          slot: "inspector",
          inspectorGroup: "deck-object-geometry",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
        {
          id: "rotation",
          kind: "number",
          label: tt("旋转"),
          value: element.rotation,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "deck-object-geometry",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
        { id: "layer-up", kind: "action", label: tt("上移一层"), icon: "bring-forward", placement: "more" },
        { id: "layer-down", kind: "action", label: tt("下移一层"), icon: "send-backward", placement: "more" },
      ] as SelectionControl[]).map((control) =>
        deckToolbarControlAllowed(element, control.id)
          ? control
          : { ...control, disabled: true },
      ),
    };
  }, [editor.activeIndex, editor.deck.slides.length, element, slide, tt]);

  const command = (message: SelectionCommand) => {
    if (!context || message.selectionId !== context.id) return;
    if (element && !deckToolbarControlAllowed(element, message.controlId)) {
      return;
    }
    applyDeckToolbarCommand(editor, element, message);
  };
  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
