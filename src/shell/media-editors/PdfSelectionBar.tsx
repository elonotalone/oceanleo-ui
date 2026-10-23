"use client";

/**
 * PDF 的统一编辑栏内容（D9，词表 `00-dispatch.md` §4 + 增补 A-1）。
 *
 * - 选中一条批注：编辑栏变成它的属性。加文字（FreeText）用文字组 + 底色 + 透明度；
 *   高亮用填充色；下划线 / 删除线 / 画笔 / ✓ / ✗ 用描边面板；便签用填充色 + 便签内容；
 *   图片 / 签名图章用透明度。都带对象组的「删除」。
 * - 没选中、但开着某个工具：同一套控件改的是这个工具的默认值（「选颜色后拖选文字」）。
 * - 只出查看器真做得到的项：标准字体只有 Helvetica / Times / Courier 三族，所以
 *   字体下拉只列这三个；下划线、删除线、列表、行距、链接对批注文字做不到，不出。
 */
import { useMemo, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type { SelectionCommand, SelectionContext, SelectionControl } from "../selection-context";
import { PDF_SUBTYPE, type PdfAnnotationLike, type PdfViewerBridge } from "./pdf-viewer-bridge";
import { PDF_MARK_TOOL_IDS } from "./pdf-mark-tools";

/** 标准 14 字体里三族 × 粗 / 斜（`PdfStandardFont`）。 */
const FONT_TABLE: Record<string, [number, number, number, number]> = {
  Helvetica: [4, 5, 7, 6],
  Times: [8, 9, 11, 10],
  Courier: [0, 1, 3, 2],
};

export function pdfFontParts(font: unknown): { family: string; bold: boolean; italic: boolean } {
  for (const [family, codes] of Object.entries(FONT_TABLE)) {
    const at = codes.indexOf(Number(font));
    if (at >= 0) return { family, bold: at === 1 || at === 3, italic: at === 2 || at === 3 };
  }
  return { family: "Helvetica", bold: false, italic: false };
}

export function pdfFontCode(family: string, bold: boolean, italic: boolean): number {
  const codes = FONT_TABLE[family] || FONT_TABLE.Helvetica;
  return codes[bold && italic ? 3 : bold ? 1 : italic ? 2 : 0];
}

const ALIGN = ["left", "center", "right"] as const;

type Kind = "freetext" | "highlight" | "line" | "ink" | "note" | "stamp" | null;

export function pdfAnnotationKind(type: number | undefined): Kind {
  switch (type) {
    case PDF_SUBTYPE.FREETEXT:
      return "freetext";
    case PDF_SUBTYPE.HIGHLIGHT:
      return "highlight";
    case PDF_SUBTYPE.UNDERLINE:
    case PDF_SUBTYPE.STRIKEOUT:
      return "line";
    case PDF_SUBTYPE.INK:
      return "ink";
    case PDF_SUBTYPE.TEXT:
      return "note";
    case PDF_SUBTYPE.STAMP:
      return "stamp";
    default:
      return null;
  }
}

const TOOL_KIND: Record<string, Kind> = {
  freeText: "freetext",
  highlight: "highlight",
  underline: "line",
  strikeout: "line",
  ink: "ink",
  [PDF_MARK_TOOL_IDS.check]: "ink",
  [PDF_MARK_TOOL_IDS.cross]: "ink",
  textComment: "note",
};

/** 编辑栏要不要出选区段：选中了能编辑的批注，或开着有设置项的工具。 */
export function pdfSelectionBarVisible(
  selected: PdfAnnotationLike | null,
  activeTool: string | null,
  readOnly: boolean,
): boolean {
  void activeTool;
  if (readOnly) return false;
  return Boolean(selected && pdfAnnotationKind(selected.type) !== null);
}

/** 工具颜色（开着工具时舞台左上角的小色板；编辑栏留给工具按钮本身）。 */
export const PDF_TOOL_SWATCHES: readonly string[] = [
  "#FFCD45",
  "#5CC96E",
  "#25D2D1",
  "#597CE2",
  "#E44234",
  "#000000",
];

export function pdfToolColorField(toolId: string): "strokeColor" | "fontColor" | null {
  const kind = TOOL_KIND[toolId];
  if (kind === "freetext") return "fontColor";
  return kind ? "strokeColor" : null;
}

export function PdfToolPalette({
  bridge,
  activeTool,
}: {
  bridge: PdfViewerBridge;
  activeTool: string | null;
}) {
  const tt = useUI();
  const [tick, setTick] = useState(0);
  void tick;
  const field = activeTool ? pdfToolColorField(activeTool) : null;
  if (!activeTool || !field) return null;
  const current = String(bridge.toolDefaults(activeTool)[field] || "").toLowerCase();
  return (
    <div
      role="radiogroup"
      aria-label={tt("颜色")}
      data-pdf-tool-palette={activeTool}
      className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] px-2 py-1.5 shadow-[var(--awb-shadow-floating)]"
    >
      {PDF_TOOL_SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={current === color.toLowerCase()}
          aria-label={color}
          onClick={() => {
            bridge.setToolDefaults(activeTool, { [field]: color, ...(field === "strokeColor" ? { color } : {}) });
            setTick((value) => value + 1);
          }}
          className={`h-5 w-5 rounded-full ring-1 ring-[var(--awb-border)] ${
            current === color.toLowerCase() ? "outline outline-2 outline-offset-2 outline-[var(--awb-accent)]" : ""
          }`}
          style={{ background: color }}
        />
      ))}
    </div>
  );
}

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

/** 选区 / 工具 → 编辑栏控件（纯函数，测试直接断言）。 */
export function pdfSelectionControls(
  kind: Kind,
  values: Record<string, unknown>,
  tt: (zh: string) => string,
  deletable: boolean,
): SelectionControl[] {
  const opacity = Math.round((Number(values.opacity ?? 1) || 1) * 100);
  const opacityControl: SelectionControl = {
    id: "opacity-value",
    kind: "range",
    label: tt("透明度"),
    value: opacity,
    min: 10,
    max: 100,
    step: 5,
    suffix: "%",
    slot: "inspector",
    inspectorGroup: "opacity",
  };
  const remove: SelectionControl[] = deletable
    ? [{ id: "delete", kind: "action", label: tt("删除"), danger: true }]
    : [];
  const color = hex(values.strokeColor ?? values.color, "#e44234");
  switch (kind) {
    case "freetext": {
      const font = pdfFontParts(values.fontFamily);
      return [
        {
          id: "font-family",
          kind: "select",
          label: tt("字体"),
          value: font.family,
          options: Object.keys(FONT_TABLE).map((name) => ({ value: name, label: name })),
        },
        {
          id: "font-size",
          kind: "number",
          label: tt("字号"),
          value: Number(values.fontSize ?? 14),
          min: 6,
          max: 96,
          step: 1,
        },
        { id: "bold", kind: "toggle", label: tt("加粗"), value: font.bold },
        { id: "italic", kind: "toggle", label: tt("斜体"), value: font.italic },
        { id: "text-color", kind: "color", label: tt("文字颜色"), value: hex(values.fontColor, "#000000") },
        {
          id: "align",
          kind: "select",
          label: tt("对齐"),
          value: ALIGN[Number(values.textAlign ?? 0)] || "left",
          options: ALIGN.map((value) => ({ value, label: value })),
        },
        { id: "fill", kind: "color", label: tt("底色"), value: hex(values.color ?? values.backgroundColor, "#ffffff") },
        opacityControl,
        ...remove,
      ];
    }
    case "highlight":
    case "note":
      return [
        { id: "fill", kind: "color", label: tt("颜色"), value: color },
        opacityControl,
        ...(kind === "note" && deletable
          ? [
              {
                id: "pdf-note-text",
                kind: "text" as const,
                label: tt("便签内容"),
                value: String(values.contents ?? ""),
                slot: "inspector" as const,
                inspectorGroup: "pdf-note",
                inspectorLabel: tt("便签内容"),
              },
            ]
          : []),
        ...remove,
      ];
    case "line":
    case "ink":
      return [
        {
          id: "stroke-color",
          kind: "color",
          label: tt("颜色"),
          value: color,
          slot: "inspector",
          inspectorGroup: "stroke",
        },
        ...(kind === "ink"
          ? [
              {
                id: "stroke-width",
                kind: "range" as const,
                label: tt("粗细"),
                value: Number(values.strokeWidth ?? 3),
                min: 1,
                max: 20,
                step: 1,
                slot: "inspector" as const,
                inspectorGroup: "stroke",
              },
            ]
          : []),
        opacityControl,
        ...remove,
      ];
    case "stamp":
      return [opacityControl, ...remove];
    default:
      return [];
  }
}

/** 一条控件命令 → 批注字段补丁（工具默认值用同一份）。 */
export function pdfSelectionPatch(
  kind: Kind,
  values: Record<string, unknown>,
  controlId: string,
  value: unknown,
): Record<string, unknown> | null {
  const font = pdfFontParts(values.fontFamily);
  switch (controlId) {
    case "font-family":
      return { fontFamily: pdfFontCode(String(value), font.bold, font.italic) };
    case "font-size":
      return Number.isFinite(Number(value)) ? { fontSize: Math.max(6, Math.min(96, Number(value))) } : null;
    case "bold":
      return { fontFamily: pdfFontCode(font.family, Boolean(value), font.italic) };
    case "italic":
      return { fontFamily: pdfFontCode(font.family, font.bold, Boolean(value)) };
    case "text-color":
      return { fontColor: hex(value, "#000000") };
    case "align":
      return { textAlign: Math.max(0, ALIGN.indexOf(value as (typeof ALIGN)[number])) };
    case "fill":
      return kind === "freetext"
        ? { color: hex(value, "#ffffff"), backgroundColor: hex(value, "#ffffff") }
        : { strokeColor: hex(value, "#e44234"), color: hex(value, "#e44234") };
    case "stroke-color":
      return { strokeColor: hex(value, "#e44234"), color: hex(value, "#e44234") };
    case "stroke-width":
      return { strokeWidth: Math.max(1, Math.min(20, Number(value) || 1)) };
    case "opacity-value":
      return { opacity: Math.max(0.1, Math.min(1, Number(value) / 100)) };
    case "pdf-note-text":
      return { contents: String(value ?? "").slice(0, 4000) };
    default:
      return null;
  }
}

export function PdfSelectionBar({
  bridge,
  selected,
  activeTool,
  version,
  readOnly,
  accent,
}: {
  bridge: PdfViewerBridge;
  selected: PdfAnnotationLike | null;
  activeTool: string | null;
  /** 批注 / 工具状态变了就变，控件值跟着刷新。 */
  version: number;
  readOnly: boolean;
  accent: string;
}) {
  const tt = useUI();
  const [toolTick, setToolTick] = useState(0);
  const context = useMemo<SelectionContext | null>(() => {
    if (readOnly) return null;
    if (selected) {
      const kind = pdfAnnotationKind(selected.type);
      const controls = pdfSelectionControls(kind, selected, tt, true);
      if (!controls.length) return null;
      return {
        version: 1,
        kind: "pdf-annotation",
        bar: kind === "freetext" ? "text" : kind === "stamp" ? "image" : "shape",
        id: `annotation:${selected.id}`,
        revision: version,
        label: tt("PDF 批注"),
        controls,
      };
    }
    const kind = activeTool ? TOOL_KIND[activeTool] ?? null : null;
    if (!activeTool || !kind) return null;
    const controls = pdfSelectionControls(kind, bridge.toolDefaults(activeTool), tt, false);
    return {
      version: 1,
      kind: "pdf-tool",
      bar: kind === "freetext" ? "text" : "shape",
      id: `tool:${activeTool}`,
      revision: `${version}:${toolTick}`,
      label: tt("工具设置"),
      controls,
    };
  }, [activeTool, bridge, readOnly, selected, tt, version, toolTick]);
  if (!context) return null;
  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    if (selected) {
      if (message.controlId === "delete") {
        bridge.deleteAnnotation(selected);
        return;
      }
      const patch = pdfSelectionPatch(pdfAnnotationKind(selected.type), selected, message.controlId, message.value);
      if (patch) bridge.updateAnnotation(selected, patch);
      return;
    }
    if (!activeTool) return;
    const defaults = bridge.toolDefaults(activeTool);
    const patch = pdfSelectionPatch(TOOL_KIND[activeTool] ?? null, defaults, message.controlId, message.value);
    if (patch) {
      bridge.setToolDefaults(activeTool, patch);
      setToolTick((value) => value + 1);
    }
  };
  return <SelectionToolbar context={context} onCommand={command} accent={accent} />;
}
