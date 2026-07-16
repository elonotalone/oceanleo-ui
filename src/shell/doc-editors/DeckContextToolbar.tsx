"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import { useAdvancedLayout } from "../advanced-layout-context";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import { applyDeckToolbarCommand } from "./deck-toolbar-command";
import {
  applyDeckQuickTool,
  deckQuickTools,
  type DeckCreationTool,
} from "./deck-quick-tools";
import type { DeckEditorState } from "./use-deck-editor";

export function DeckContextToolbar({
  editor,
  accent = "#4f46e5",
  activeTool = "select",
  onActiveToolChange,
}: {
  editor: DeckEditorState;
  accent?: string;
  activeTool?: DeckCreationTool;
  onActiveToolChange?: (tool: DeckCreationTool) => void;
}) {
  const tt = useUI();
  const layout = useAdvancedLayout();
  const element = editor.selectedElement;
  const slide = editor.activeSlide;
  const context = useMemo<SelectionContext>(() => {
    const tools = deckQuickTools(tt, activeTool);
    if (!element) {
      return {
        version: 1,
        kind: "slide",
        id: slide.id,
        label: tt("当前幻灯片"),
        controls: [
          ...tools,
          {
            id: "add-slide",
            kind: "action",
            label: tt("新建一页"),
            icon: "add",
            group: "page",
          },
          {
            id: "layout",
            kind: "select",
            label: tt("版式"),
            icon: "pages",
            group: "page",
            value: slide.layout,
            options: [
              ["title", "封面标题"],
              ["title-body", "标题正文"],
              ["section", "章节页"],
              ["bullets", "要点列表"],
              ["image-left", "左图右文"],
              ["image-right", "左文右图"],
              ["blank", "空白页"],
            ].map(([value, label]) => ({ value, label: tt(label) })),
          },
          {
            id: "background",
            kind: "color",
            label: tt("背景"),
            icon: "background",
            group: "design",
            value: slide.background || "#ffffff",
          },
          {
            id: "design-panel",
            kind: "panel",
            label: tt("设计"),
            icon: "templates",
            group: "design",
            panelId: "deck-design",
          },
          {
            id: "notes",
            kind: "text",
            label: tt("备注"),
            value: slide.notes,
            placement: "more",
          },
          {
            id: "duplicate-slide",
            kind: "action",
            label: tt("复制幻灯片"),
            placement: "more",
          },
          {
            id: "delete-slide",
            kind: "action",
            label: tt("删除幻灯片"),
            danger: true,
            disabled: editor.deck.slides.length <= 1,
            placement: "more",
          },
        ],
      };
    }
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
      },
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
      controls: [
        ...tools,
        ...(element.type === "text"
          ? [
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
              },
              {
                id: "shadow",
                kind: "toggle" as const,
                label: tt("阴影"),
                icon: "effects" as const,
                group: "image",
                value: element.shadow === true,
                placement: "more" as const,
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
        { id: "x", kind: "number", label: "X", suffix: "%", value: element.x, placement: "more" },
        { id: "y", kind: "number", label: "Y", suffix: "%", value: element.y, placement: "more" },
        {
          id: "width",
          kind: "number",
          label: tt("宽") + " %",
          value: element.width,
          suffix: "%",
          placement: "more",
        },
        {
          id: "height",
          kind: "number",
          label: tt("高") + " %",
          value: element.height,
          suffix: "%",
          placement: "more",
        },
        {
          id: "rotation",
          kind: "number",
          label: tt("旋转"),
          value: element.rotation,
          placement: "more",
        },
        { id: "layer-up", kind: "action", label: tt("上移一层"), icon: "bring-forward", placement: "more" },
        { id: "layer-down", kind: "action", label: tt("下移一层"), icon: "send-backward", placement: "more" },
      ],
    };
  }, [
    editor.canRedo,
    editor.canUndo,
    editor.deck.slides.length,
    activeTool,
    element,
    slide,
    tt,
  ]);

  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    if (
      applyDeckQuickTool(editor, message, {
        setActiveTool: (tool) => onActiveToolChange?.(tool),
        openDrawer: (drawerId) => layout?.openDrawer(drawerId),
      })
    ) {
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
