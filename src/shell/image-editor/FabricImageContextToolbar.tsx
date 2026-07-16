"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import type { CropRatio, FabricImageEditorState } from "./types";

function numeric(value: SelectionCommand["value"], fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function FabricImageContextToolbar({
  editor,
  accent = "#4f46e5",
}: {
  editor: FabricImageEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const selected = editor.selected;
  const filters = editor.filterInfo?.settings;
  const context = useMemo<SelectionContext>(() => {
    const controls: SelectionControl[] = [
      {
        id: "undo",
        kind: "action",
        label: tt("撤销"),
        icon: "undo",
        iconOnly: true,
        group: "history",
        disabled: !editor.canUndo,
      },
      {
        id: "redo",
        kind: "action",
        label: tt("重做"),
        icon: "redo",
        iconOnly: true,
        group: "history",
        disabled: !editor.canRedo,
      },
    ];
    if (selected?.text) {
      controls.push(
        {
          id: "font-panel",
          kind: "panel",
          label: selected.text.fontFamily || tt("字体"),
          icon: "font",
          group: "type",
          panelId: "image-fonts",
        },
        {
          id: "text",
          kind: "text",
          label: tt("文字"),
          value: selected.text.value,
        },
        {
          id: "font-size",
          kind: "number",
          label: tt("字号"),
          group: "type",
          value: selected.text.fontSize,
          min: 6,
          max: 320,
          step: 1,
        },
        {
          id: "text-color",
          kind: "color",
          label: tt("文字色"),
          icon: "font",
          iconOnly: true,
          group: "type",
          value: selected.text.fill || "#000000",
        },
        {
          id: "bold",
          kind: "toggle",
          label: tt("粗体"),
          icon: "bold",
          iconOnly: true,
          group: "style",
          value: selected.text.bold,
        },
        {
          id: "italic",
          kind: "toggle",
          label: tt("斜体"),
          icon: "italic",
          iconOnly: true,
          group: "style",
          value: selected.text.italic,
        },
        {
          id: "underline",
          kind: "toggle",
          label: tt("下划线"),
          icon: "underline",
          iconOnly: true,
          group: "style",
          value: selected.text.underline,
        },
        {
          id: "linethrough",
          kind: "toggle",
          label: tt("删除线"),
          group: "style",
          value: selected.text.linethrough,
          placement: "more",
        },
        {
          id: "align",
          kind: "select",
          label: tt("对齐"),
          icon: "align-left",
          group: "paragraph",
          value: selected.text.align,
          options: [
            { value: "left", label: tt("左") },
            { value: "center", label: tt("中") },
            { value: "right", label: tt("右") },
          ],
        },
        {
          id: "line-height",
          kind: "number",
          label: tt("行距"),
          icon: "spacing",
          value: selected.text.lineHeight,
          min: 0.5,
          max: 4,
          step: 0.05,
          placement: "more",
        },
        {
          id: "char-spacing",
          kind: "number",
          label: tt("字距"),
          value: selected.text.charSpacing,
          min: -200,
          max: 1_000,
          step: 10,
          placement: "more",
        },
      );
    } else if (
      selected &&
      selected.kind !== "image" &&
      selected.kind !== "background"
    ) {
      controls.push({
        id: "fill",
        kind: "color",
        label: tt("填充"),
        icon: "background",
        group: "appearance",
        value: selected.fill || "#000000",
      });
    }
    if (selected) {
      controls.push(
        {
          id: "opacity",
          kind: "range",
          label: tt("透明度"),
          icon: "opacity",
          group: "appearance",
          value: selected.opacity,
          min: 0,
          max: 100,
          step: 1,
        },
        {
          id: "stroke",
          kind: "color",
          label: tt("描边"),
          value: selected.stroke || "#000000",
          placement: "more",
        },
        {
          id: "stroke-width",
          kind: "range",
          label: tt("描边宽度"),
          value: selected.strokeWidth,
          min: 0,
          max: 30,
          step: 1,
          placement: "more",
        },
        ...(selected.radius !== null
          ? [
              {
                id: "radius",
                kind: "range" as const,
                label: tt("圆角"),
                value: selected.radius,
                min: 0,
                max: 300,
                step: 1,
                placement: "more" as const,
              },
            ]
          : []),
        {
          id: "shadow",
          kind: "toggle",
          label: tt("投影"),
          icon: "effects",
          value: selected.shadow.enabled,
          placement: "more",
        },
      );
    } else {
      controls.push(
        {
          id: "tool-select",
          kind: "toggle",
          label: tt("选择"),
          icon: "position",
          group: "tools",
          value: editor.activeTool === "select",
        },
        {
          id: "tool-draw",
          kind: "toggle",
          label: tt("画笔"),
          icon: "effects",
          group: "tools",
          value: editor.activeTool === "draw",
        },
        {
          id: "tool-erase",
          kind: "toggle",
          label: tt("橡皮"),
          icon: "delete",
          group: "tools",
          value: editor.activeTool === "erase",
        },
        {
          id: "zoom-out",
          kind: "action",
          label: tt("缩小"),
          group: "zoom",
        },
        {
          id: "zoom-fit",
          kind: "action",
          label: `${Math.round(editor.zoom * 100)}%`,
          group: "zoom",
        },
        {
          id: "zoom-in",
          kind: "action",
          label: tt("放大"),
          group: "zoom",
        },
        {
          id: "canvas-background",
          kind: "color",
          label: tt("画布背景"),
          icon: "background",
          group: "canvas",
          value: editor.canvasBackground,
        },
      );
    }
    if (selected?.kind === "image") {
      controls.push(
        {
          id: "replace-panel",
          kind: "panel",
          label: tt("替换"),
          icon: "image",
          group: "image",
          panelId: "materials",
          panelAction: "replace",
        },
        {
          id: "filter-panel",
          kind: "panel",
          label: tt("滤镜"),
          icon: "filter",
          group: "image",
          panelId: "image-filters",
        },
      );
    }
    if (
      !selected ||
      selected.kind === "image" ||
      selected.kind === "background"
    ) {
      controls.push(
        {
          id: editor.cropping ? "crop-apply" : "crop-start",
          kind: "action",
          label: editor.cropping ? tt("应用裁剪") : tt("裁剪"),
          icon: "crop",
          group: "transform",
        },
        ...(editor.cropping
          ? [
              {
                id: "crop-cancel",
                kind: "action" as const,
                label: tt("取消"),
              },
            ]
          : []),
        {
          id: "crop-ratio",
          kind: "select",
          label: tt("比例"),
          value: editor.cropRatio,
          options: [
            { value: "free", label: tt("自由") },
            { value: "1:1", label: "1:1" },
            { value: "4:3", label: "4:3" },
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
          ],
          placement: "more",
        },
      );
    }
    if (selected || editor.transformInfo) {
      controls.push(
        { id: "rotate-left", kind: "action", label: "↶ 90°", icon: "rotate", placement: "more" },
        { id: "rotate-right", kind: "action", label: "↷ 90°", icon: "rotate", placement: "more" },
        { id: "flip-x", kind: "action", label: tt("水平翻转"), icon: "flip-horizontal", placement: "more" },
        { id: "flip-y", kind: "action", label: tt("垂直翻转"), icon: "flip-vertical", placement: "more" },
      );
    }
    if (filters) {
      controls.push(
        {
          id: "brightness",
          kind: "range",
          label: tt("亮度"),
          value: filters.brightness,
          min: -100,
          max: 100,
          placement: "more",
        },
        {
          id: "contrast",
          kind: "range",
          label: tt("对比度"),
          value: filters.contrast,
          min: -100,
          max: 100,
          placement: "more",
        },
        {
          id: "saturation",
          kind: "range",
          label: tt("饱和度"),
          value: filters.saturation,
          min: -100,
          max: 100,
          placement: "more",
        },
        {
          id: "grayscale",
          kind: "toggle",
          label: tt("黑白"),
          value: filters.grayscale,
          placement: "more",
        },
      );
    }
    if (selected && !selected.isBackground) {
      controls.push(
        {
          id: "duplicate",
          kind: "action",
          label: tt("复制"),
          icon: "duplicate",
          placement: "more",
        },
        {
          id: "delete",
          kind: "action",
          label: tt("删除"),
          icon: "delete",
          danger: true,
          placement: "more",
        },
      );
    }
    return {
      version: 1,
      kind: selected?.kind || "canvas",
      id: selected?.id || "canvas",
      label: selected ? tt("已选 {kind}", { kind: selected.kind }) : tt("画布"),
      controls,
    };
  }, [
    editor.canvasBackground,
    editor.activeTool,
    editor.canRedo,
    editor.canUndo,
    editor.cropRatio,
    editor.cropping,
    editor.transformInfo,
    editor.zoom,
    filters,
    selected,
    tt,
  ]);

  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    switch (message.controlId) {
      case "undo":
        editor.undo();
        break;
      case "redo":
        editor.redo();
        break;
      case "tool-select":
        editor.setActiveTool("select");
        break;
      case "tool-draw":
        editor.setActiveTool("draw");
        break;
      case "tool-erase":
        editor.setActiveTool("erase");
        break;
      case "zoom-out":
        editor.zoomOut();
        break;
      case "zoom-fit":
        editor.zoomFit();
        break;
      case "zoom-in":
        editor.zoomIn();
        break;
      case "text":
        editor.setSelectedText({ value: String(message.value ?? "") });
        break;
      case "font-size":
        editor.setSelectedText({ fontSize: numeric(message.value, 16) });
        break;
      case "text-color":
        editor.setSelectedText({ fill: String(message.value || "#000000") });
        break;
      case "bold":
        editor.setSelectedText({ bold: message.value === true });
        break;
      case "italic":
        editor.setSelectedText({ italic: message.value === true });
        break;
      case "underline":
        editor.setSelectedText({ underline: message.value === true });
        break;
      case "linethrough":
        editor.setSelectedText({ linethrough: message.value === true });
        break;
      case "line-height":
        editor.setSelectedText({ lineHeight: numeric(message.value, 1.16) });
        break;
      case "char-spacing":
        editor.setSelectedText({ charSpacing: numeric(message.value, 0) });
        break;
      case "align":
        if (message.value === "left" || message.value === "center" || message.value === "right") {
          editor.setSelectedText({ align: message.value });
        }
        break;
      case "fill":
        editor.setSelectedFill(String(message.value || "#000000"));
        break;
      case "opacity":
        editor.setSelectedOpacity(numeric(message.value, 100));
        break;
      case "stroke":
        editor.setSelectedStroke({ color: String(message.value || "#000000") });
        break;
      case "stroke-width":
        editor.setSelectedStroke({ width: numeric(message.value) });
        break;
      case "radius":
        editor.setSelectedRadius(numeric(message.value));
        break;
      case "shadow":
        editor.setSelectedShadow({ enabled: message.value === true });
        break;
      case "canvas-background":
        editor.setCanvasBackground(String(message.value || "#ffffff"));
        break;
      case "crop-start":
        editor.startCrop();
        break;
      case "crop-apply":
        void editor.confirmCrop();
        break;
      case "crop-cancel":
        editor.cancelCrop();
        break;
      case "crop-ratio":
        if (["free", "1:1", "4:3", "16:9", "9:16"].includes(String(message.value))) {
          editor.setCropRatio(message.value as CropRatio);
          if (!editor.cropping) editor.startCrop();
        }
        break;
      case "rotate-left":
        editor.rotateTarget(-90);
        break;
      case "rotate-right":
        editor.rotateTarget(90);
        break;
      case "flip-x":
        editor.flipTarget("x");
        break;
      case "flip-y":
        editor.flipTarget("y");
        break;
      case "brightness":
      case "contrast":
      case "saturation":
        editor.setFilter(message.controlId, numeric(message.value));
        break;
      case "grayscale":
        editor.setFilter("grayscale", message.value === true);
        break;
      case "duplicate":
        void editor.duplicateSelected();
        break;
      case "delete":
        editor.deleteSelected();
        break;
    }
  };

  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
