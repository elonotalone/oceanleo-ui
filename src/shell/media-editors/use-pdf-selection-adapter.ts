"use client";

import { useMemo, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { selectionAdapterContext } from "../selection-adapter";
import type { SelectionAdapter, SelectionCommand, SelectionContext } from "../selection-context";
import type { PdfAnnotationLike, PdfViewerBridge } from "./pdf-viewer-bridge";
import { PDF_TOOL_KIND, pdfAnnotationKind, pdfSelectionControls, pdfSelectionPatch,
  pdfFontSizePixels, pdfFontSizePoints } from "./pdf-selection-controls";

export function usePdfSelectionAdapter({
  bridge,
  selected,
  activeTool,
  version,
  readOnly,
  enabled = true,
}: {
  bridge: PdfViewerBridge | null;
  selected: PdfAnnotationLike | null;
  activeTool: string | null;
  /** 批注 / 工具状态变了就变，控件值跟着刷新。 */
  version: number;
  readOnly: boolean;
  enabled?: boolean;
}): SelectionAdapter {
  const tt = useUI();
  const [toolTick, setToolTick] = useState(0);
  const context = useMemo<SelectionContext | null>(() => {
    if (!enabled || !bridge || readOnly) return null;
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
    const kind = activeTool ? PDF_TOOL_KIND[activeTool] ?? null : null;
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
  }, [activeTool, bridge, enabled, readOnly, selected, tt, version, toolTick]);
  const command = (message: SelectionCommand) => {
    if (readOnly || !bridge || !context || message.selectionId !== context.id) return;
    if (message.selectionRevision !== undefined && message.selectionRevision !== context.revision) return;
    if (!context.controls.some((control) => control.id === (message.controlId === "opacity-value" ? "opacity" : message.controlId))) return;
    if (selected) {
      let target = selected;
      if (message.controlId === "case") {
        // FreeText keeps typing in its editable DOM until blur. Commit it before
        // transforming contents, then read the current native object rather than this render's snapshot.
        bridge.flushTextEdit();
        const current = bridge.selected();
        if (!current || current.id !== selected.id) return;
        target = current;
      }
      if (message.controlId === "delete") {
        bridge.deleteAnnotation(selected);
        return;
      }
      const patch = message.controlId === "font-size"
        ? fontSizePatch(message.value)
        : pdfSelectionPatch(pdfAnnotationKind(target.type), target, message.controlId, message.value);
      if (patch) bridge.updateAnnotation(target, patch);
      return;
    }
    if (!activeTool) return;
    const defaults = bridge.toolDefaults(activeTool);
    const patch = message.controlId === "font-size"
      ? fontSizePatch(message.value)
      : pdfSelectionPatch(PDF_TOOL_KIND[activeTool] ?? null, defaults, message.controlId, message.value);
    if (patch) {
      bridge.setToolDefaults(activeTool, patch);
      setToolTick((value) => value + 1);
    }
  };
  const adapterContext = selectionAdapterContext(context);
  if (adapterContext) adapterContext.controls = adapterContext.controls.map((control) =>
    control.id === "font-size" ? {
      ...control, value: pdfFontSizePixels(control.value), min: 6, max: 96, step: 1,
    } : control,
  );
  return { context: adapterContext, dispatch: command };
}

function fontSizePatch(value: unknown): Record<string, unknown> | null {
  const fontSize = pdfFontSizePoints(value);
  return fontSize === null ? null : { fontSize };
}
