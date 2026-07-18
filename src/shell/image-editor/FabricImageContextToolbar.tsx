"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import { fabricImageFilterControls } from "./fabric-image-filter-controls";
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
  const context = useMemo<SelectionContext | null>(() => {
    // The floating bar is strictly contextual. Creation, canvas and layer
    // controls remain available from the fixed workspace tools button.
    if (!selected) return null;
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
    const controls: SelectionControl[] = [];
    const selectedIsImage =
      selected.kind === "image" || selected.kind === "background";
    if (selectedIsImage) {
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
          id: editor.cropping ? "crop-apply" : "crop-start",
          kind: "action",
          label: editor.cropping ? tt("应用裁剪") : tt("裁剪"),
          icon: "crop",
          group: "image",
        },
        {
          id: "image-fit",
          kind: "select",
          label: tt("适配"),
          icon: "image",
          group: "image",
          value: selected.imageFit || "fill",
          options: [
            { value: "contain", label: tt("完整显示") },
            { value: "cover", label: tt("填满裁剪") },
            { value: "fill", label: tt("拉伸填满") },
          ],
        },
        {
          id: "filter-panel",
          kind: "panel",
          label: tt("滤镜"),
          icon: "filter",
          group: "image",
          panelId: "image-filters",
        },
        {
          id: "crop-ratio",
          kind: "select",
          label: tt("裁剪比例"),
          value: editor.cropRatio,
          options: [
            { value: "free", label: tt("自由") },
            { value: "1:1", label: "1:1" },
            { value: "4:3", label: "4:3" },
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
          ],
          placement: "more",
          slot: "inspector",
          inspectorGroup: "image-crop",
          inspectorLabel: tt("裁剪设置"),
          inspectorIcon: "crop",
        },
        ...(editor.cropping
          ? [
              {
                id: "crop-cancel",
                kind: "action" as const,
                label: tt("取消"),
                group: "image",
              },
            ]
          : []),
      );
    }
    if (selected?.text) {
      controls.push(
        {
          id: "text",
          kind: "text",
          label: tt("文字内容"),
          value: selected.text.value,
          slot: "inspector",
          inspectorGroup: "image-text-content",
          inspectorLabel: tt("文字内容"),
          inspectorIcon: "text",
        },
        {
          id: "font-panel",
          kind: "panel",
          label: selected.text.fontFamily || tt("字体"),
          icon: "font",
          group: "type",
          panelId: "image-fonts",
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
          slot: "inspector",
          inspectorGroup: "image-text-typography",
          inspectorLabel: tt("文字排版"),
          inspectorIcon: "font",
        },
        {
          id: "text-color",
          kind: "color",
          label: tt("文字色"),
          icon: "font",
          iconOnly: true,
          group: "type",
          value: selected.text.fill || "#000000",
          slot: "inspector",
          inspectorGroup: "image-text-color",
          inspectorLabel: tt("文字颜色"),
          inspectorIcon: "text",
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
          slot: "inspector",
          inspectorGroup: "image-text-spacing",
          inspectorLabel: tt("间距"),
          inspectorIcon: "spacing",
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
          slot: "inspector",
          inspectorGroup: "image-text-spacing",
          inspectorLabel: tt("间距"),
          inspectorIcon: "spacing",
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
          slot: "inspector",
          inspectorGroup: "image-table-structure",
          inspectorLabel: tt("表格结构"),
          inspectorIcon: "table",
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
          slot: "inspector",
          inspectorGroup: "image-table-structure",
          inspectorLabel: tt("表格结构"),
          inspectorIcon: "table",
        },
        {
          id: "table-header-fill",
          kind: "color",
          label: tt("表头"),
          icon: "background",
          group: "table-style",
          value: selected.table.style.headerFill,
          slot: "inspector",
          inspectorGroup: "image-table-style",
          inspectorLabel: tt("表格样式"),
          inspectorIcon: "table",
        },
        {
          id: "table-body-fill",
          kind: "color",
          label: tt("单元格"),
          group: "table-style",
          value: selected.table.style.bodyFill,
          slot: "inspector",
          inspectorGroup: "image-table-style",
          inspectorLabel: tt("表格样式"),
          inspectorIcon: "table",
        },
        {
          id: "table-text-color",
          kind: "color",
          label: tt("文字色"),
          icon: "font",
          group: "table-style",
          value: selected.table.style.textColor,
          slot: "inspector",
          inspectorGroup: "image-table-style",
          inspectorLabel: tt("表格样式"),
          inspectorIcon: "table",
        },
        {
          id: "table-border-color",
          kind: "color",
          label: tt("边框"),
          group: "table-style",
          value: selected.table.style.borderColor,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "image-table-style",
          inspectorLabel: tt("表格样式"),
          inspectorIcon: "table",
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
          slot: "inspector",
          inspectorGroup: "image-table-style",
          inspectorLabel: tt("表格样式"),
          inspectorIcon: "table",
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
          slot: "inspector",
          inspectorGroup: "image-appearance",
          inspectorLabel: tt("外观"),
          inspectorIcon: "opacity",
        },
        ...(!selected.table && !selectedIsLineLike
          ? [
              {
                id: "stroke",
                kind: "color" as const,
                label: tt("描边"),
                value: selected.stroke || "#000000",
                placement: selectedIsImage ? undefined : ("more" as const),
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
                slot: "inspector" as const,
                inspectorGroup: "image-appearance",
                inspectorLabel: tt("外观"),
                inspectorIcon: "effects" as const,
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
                placement: selectedIsImage ? undefined : ("more" as const),
                slot: "inspector" as const,
                inspectorGroup: "image-appearance",
                inspectorLabel: tt("外观"),
                inspectorIcon: "effects" as const,
              },
            ]
          : []),
        {
          id: "shadow",
          kind: "toggle",
          label: tt("投影"),
          icon: "effects",
          value: selected.shadow.enabled,
          placement: selectedIsImage ? undefined : "more",
        },
      );
    }
    if (selected || editor.transformInfo) {
      controls.push(
        { id: "rotate-left", kind: "action", label: "↶ 90°", icon: "rotate", placement: "more" },
        { id: "rotate-right", kind: "action", label: "↷ 90°", icon: "rotate", placement: "more" },
        { id: "flip-x", kind: "action", label: tt("水平翻转"), icon: "flip-horizontal", placement: selectedIsImage ? undefined : "more" },
        { id: "flip-y", kind: "action", label: tt("垂直翻转"), icon: "flip-vertical", placement: selectedIsImage ? undefined : "more" },
        {
          id: "angle",
          kind: "number",
          label: tt("旋转"),
          value: selected.angle,
          min: 0,
          max: 359,
          step: 1,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "image-transform",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
      );
    }
    if (filters) {
      controls.push(...fabricImageFilterControls(filters, tt));
    }
    if (selected) {
      controls.push(
        {
          id: "position-x",
          kind: "number",
          label: "X",
          value: selected.x,
          step: 1,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "image-transform",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
        {
          id: "position-y",
          kind: "number",
          label: "Y",
          value: selected.y,
          step: 1,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "image-transform",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
        {
          id: "object-width",
          kind: "number",
          label: tt("宽"),
          value: selected.width,
          min: 1,
          step: 1,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "image-transform",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
        {
          id: "object-height",
          kind: "number",
          label: tt("高"),
          value: selected.height,
          min: 1,
          step: 1,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "image-transform",
          inspectorLabel: tt("位置与尺寸"),
          inspectorIcon: "position",
        },
        {
          id: "lock",
          kind: "toggle",
          label: tt("锁定"),
          icon: "lock",
          value: selected.locked,
          placement: "more",
        },
        {
          id: "layer-up",
          kind: "action",
          label: tt("上移一层"),
          icon: "layers",
          placement: "more",
        },
        {
          id: "layer-down",
          kind: "action",
          label: tt("下移一层"),
          icon: "layers",
          placement: "more",
        },
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
      kind: selected.kind,
      id: selected.id,
      label: tt("已选 {kind}", { kind: selected.kind }),
      controls,
    };
  }, [
    editor.canvasBackground,
    editor.cropRatio,
    editor.cropping,
    editor.loading,
    editor.transformInfo,
    filters,
    selected,
    tt,
  ]);

  const command = (message: SelectionCommand) => {
    if (!context) return;
    if (message.selectionId !== context.id) return;
    if (message.transactionId && message.phase === "start") {
      editor.beginGesture();
      return;
    }
    if (message.transactionId && message.phase === "cancel") {
      editor.cancelGesture();
      return;
    }
    dispatchFabricImageCommand(editor, message);
    if (message.transactionId && message.phase === "commit") {
      editor.endGesture();
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
