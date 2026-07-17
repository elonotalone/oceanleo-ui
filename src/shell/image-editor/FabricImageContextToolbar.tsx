"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import { dispatchFabricImageCommand } from "./fabric-image-commands";
import type { FabricImageEditorState } from "./types";

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
    // Creation tools must remain reachable on a newly opened flat image, whose
    // locked background cannot produce an editable Fabric selection.
    const selectedIsLineLike = Boolean(
      selected &&
        [
          "line",
          "dashed-line",
          "curve",
          "arrow",
          "elbow-arrow",
          "double-arrow",
        ].includes(selected.kind),
    );
    const controls: SelectionControl[] = [
      {
        id: "tool-select",
        kind: "toggle",
        label: tt("选择"),
        icon: "select",
        value: editor.activeTool === "select",
        placement: "tools",
      },
      {
        id: "tool-draw",
        kind: "panel",
        label: tt("画笔"),
        icon: "draw",
        panelId: "image-brush",
        placement: "tools",
      },
      {
        id: "tool-shape",
        kind: "panel",
        label: tt("形状"),
        icon: "shape",
        panelId: "image-shapes",
        placement: "tools",
      },
      {
        id: "tool-line",
        kind: "panel",
        label: tt("线条"),
        icon: "line",
        panelId: "image-lines",
        placement: "tools",
      },
      {
        id: "tool-note",
        kind: "panel",
        label: tt("便签"),
        icon: "note",
        panelId: "image-notes",
        placement: "tools",
      },
      {
        id: "tool-text",
        kind: "panel",
        label: tt("文字"),
        icon: "text",
        panelId: "image-text",
        placement: "tools",
      },
      {
        id: "tool-signature",
        kind: "panel",
        label: tt("签名"),
        icon: "signature",
        panelId: "image-signature",
        placement: "tools",
      },
      {
        id: "tool-table",
        kind: "panel",
        label: tt("表格"),
        icon: "table",
        panelId: "image-tables",
        placement: "tools",
      },
      {
        id: "layers-panel",
        kind: "panel",
        label: tt("图层"),
        icon: "layers",
        group: "workspace",
        panelId: "image-layers",
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
    } else if (selected?.table) {
      controls.push(
        {
          id: "table-rows",
          kind: "number",
          label: tt("行"),
          icon: "table",
          group: "table",
          value: selected.table.rows,
          min: 1,
          max: 20,
          step: 1,
        },
        {
          id: "table-columns",
          kind: "number",
          label: tt("列"),
          group: "table",
          value: selected.table.columns,
          min: 1,
          max: 20,
          step: 1,
        },
        {
          id: "table-header-fill",
          kind: "color",
          label: tt("表头"),
          icon: "background",
          group: "table-style",
          value: selected.table.style.headerFill,
        },
        {
          id: "table-body-fill",
          kind: "color",
          label: tt("单元格"),
          group: "table-style",
          value: selected.table.style.bodyFill,
        },
        {
          id: "table-text-color",
          kind: "color",
          label: tt("文字色"),
          icon: "font",
          group: "table-style",
          value: selected.table.style.textColor,
        },
        {
          id: "table-border-color",
          kind: "color",
          label: tt("边框"),
          group: "table-style",
          value: selected.table.style.borderColor,
          placement: "more",
        },
        {
          id: "table-border-width",
          kind: "range",
          label: tt("边框宽度"),
          value: selected.table.style.borderWidth,
          min: 0,
          max: 20,
          step: 1,
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
        label: selectedIsLineLike ? tt("线条色") : tt("填充"),
        icon: selectedIsLineLike ? "line" : "background",
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
        ...(!selected.table && !selectedIsLineLike
          ? [
              {
                id: "stroke",
                kind: "color" as const,
                label: tt("描边"),
                value: selected.stroke || "#000000",
                placement: "more" as const,
              },
            ]
          : []),
        ...(!selected.table
          ? [
              {
                id: "stroke-width",
                kind: "range" as const,
                label: selectedIsLineLike ? tt("线条宽度") : tt("描边宽度"),
                value: selected.strokeWidth,
                min: 0,
                max: 30,
                step: 1,
                placement: "more" as const,
              },
            ]
          : []),
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
          id: "canvas-size-panel",
          kind: "panel",
          label: tt("尺寸"),
          icon: "templates",
          group: "canvas",
          panelId: "image-canvas",
        },
        {
          id: "canvas-background",
          kind: "color",
          label: tt("背景"),
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
    if (editor.loading) {
      controls.forEach((control) => {
        control.disabled = true;
      });
    }
    return {
      version: 1,
      kind: selected?.kind || "canvas",
      id: selected?.id || "canvas",
      label: selected
        ? tt("已选 {kind}", { kind: selected.kind })
        : tt("创建与编辑"),
      controls,
    };
  }, [
    editor.canvasBackground,
    editor.activeTool,
    editor.canRedo,
    editor.canUndo,
    editor.cropRatio,
    editor.cropping,
    editor.loading,
    editor.transformInfo,
    editor.zoom,
    filters,
    selected,
    tt,
  ]);

  const command = (message: SelectionCommand) => {
    if (!context) return;
    if (message.selectionId !== context.id) return;
    dispatchFabricImageCommand(editor, message);
  };

  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
