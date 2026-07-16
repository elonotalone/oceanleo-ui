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
    const controls: SelectionControl[] = [];
    if (selected?.text) {
      controls.push(
        {
          id: "text",
          kind: "text",
          label: tt("文字"),
          value: selected.text.value,
          group: "text",
        },
        {
          id: "font-size",
          kind: "number",
          label: tt("字号"),
          icon: "font-size",
          value: selected.text.fontSize,
          min: 6,
          max: 320,
          step: 1,
          group: "text",
        },
        {
          id: "text-color",
          kind: "color",
          label: tt("文字色"),
          value: selected.text.fill || "#000000",
          group: "color",
        },
        {
          id: "bold",
          kind: "toggle",
          label: tt("加粗"),
          icon: "bold",
          iconOnly: true,
          value: selected.text.bold,
          group: "style",
        },
        {
          id: "italic",
          kind: "toggle",
          label: tt("斜体"),
          icon: "italic",
          iconOnly: true,
          value: selected.text.italic,
          group: "style",
        },
        {
          id: "align",
          kind: "select",
          label: tt("对齐"),
          icon: "align-left",
          value: selected.text.align,
          options: [
            { value: "left", label: tt("左") },
            { value: "center", label: tt("中") },
            { value: "right", label: tt("右") },
          ],
          group: "align",
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
        icon: "fill",
        value: selected.fill || "#000000",
        group: "color",
      });
    }
    if (selected) {
      controls.push(
        {
          id: "opacity",
          kind: "range",
          label: tt("透明度"),
          icon: "opacity",
          value: selected.opacity,
          min: 0,
          max: 100,
          step: 1,
          group: "adjust",
        },
        {
          id: "stroke",
          kind: "color",
          label: tt("描边"),
          icon: "stroke",
          value: selected.stroke || "#000000",
          group: "stroke",
          placement: "more",
        },
        {
          id: "stroke-width",
          kind: "range",
          label: tt("描边宽度"),
          icon: "stroke-width",
          value: selected.strokeWidth,
          min: 0,
          max: 30,
          step: 1,
          group: "stroke",
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
                group: "stroke" as const,
                placement: "more" as const,
              },
            ]
          : []),
        {
          id: "shadow",
          kind: "toggle",
          label: tt("投影"),
          icon: "shadow",
          value: selected.shadow.enabled,
          group: "stroke",
          placement: "more",
        },
      );
    } else {
      controls.push({
        id: "canvas-background",
        kind: "color",
        label: tt("画布背景"),
        icon: "background",
        value: editor.canvasBackground,
        group: "canvas",
      });
    }
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
              group: "transform" as const,
            },
          ]
        : []),
      {
        id: "crop-ratio",
        kind: "select",
        label: tt("比例"),
        icon: "ratio",
        value: editor.cropRatio,
        options: [
          { value: "free", label: tt("自由") },
          { value: "1:1", label: "1:1" },
          { value: "4:3", label: "4:3" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
        ],
        group: "transform",
        placement: "more",
      },
      { id: "rotate-left", kind: "action", label: tt("左转 90°"), icon: "rotate-left", iconOnly: true, group: "transform", placement: "more" },
      { id: "rotate-right", kind: "action", label: tt("右转 90°"), icon: "rotate-right", iconOnly: true, group: "transform", placement: "more" },
      { id: "flip-x", kind: "action", label: tt("水平翻转"), icon: "flip-h", iconOnly: true, group: "transform", placement: "more" },
      { id: "flip-y", kind: "action", label: tt("垂直翻转"), icon: "flip-v", iconOnly: true, group: "transform", placement: "more" },
    );
    if (filters) {
      controls.push(
        {
          id: "brightness",
          kind: "range",
          label: tt("亮度"),
          value: filters.brightness,
          min: -100,
          max: 100,
          group: "filter",
          placement: "more",
        },
        {
          id: "contrast",
          kind: "range",
          label: tt("对比度"),
          value: filters.contrast,
          min: -100,
          max: 100,
          group: "filter",
          placement: "more",
        },
        {
          id: "saturation",
          kind: "range",
          label: tt("饱和度"),
          value: filters.saturation,
          min: -100,
          max: 100,
          group: "filter",
          placement: "more",
        },
        {
          id: "grayscale",
          kind: "toggle",
          label: tt("黑白"),
          icon: "grayscale",
          value: filters.grayscale,
          group: "filter",
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
          iconOnly: true,
          group: "object",
          placement: "more",
        },
        {
          id: "delete",
          kind: "action",
          label: tt("删除"),
          icon: "delete",
          iconOnly: true,
          danger: true,
          group: "object",
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
    editor.cropRatio,
    editor.cropping,
    filters,
    selected,
    tt,
  ]);

  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    switch (message.controlId) {
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
