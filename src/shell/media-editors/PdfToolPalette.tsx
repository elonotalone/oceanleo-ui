"use client";

import { useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { EditBarPanelRequest } from "../EditBarFloatingPanel";
import type { PdfViewerBridge } from "./pdf-viewer-bridge";
import { PDF_TOOL_SWATCHES, pdfToolColorField } from "./pdf-selection-controls";

export function PdfToolPalette({
  bridge,
  activeTool,
  inline = false,
  triggerId,
}: {
  bridge: PdfViewerBridge;
  activeTool: string | null;
  inline?: boolean;
  triggerId?: string;
}) {
  const tt = useUI();
  const [tick, setTick] = useState(0);
  const [closed, setClosed] = useState(false);
  void tick;
  const field = activeTool ? pdfToolColorField(activeTool) : null;
  if (closed || !activeTool || !field) return null;
  const current = String(bridge.toolDefaults(activeTool)[field] || "").toLowerCase();
  const palette = (
    <div
      role="radiogroup"
      aria-label={tt("颜色")}
      data-pdf-tool-palette={activeTool}
      className={inline ? "flex items-center p-2" : "absolute left-3 top-14 z-10 flex items-center rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] px-1 shadow-[var(--awb-shadow-floating)]"}
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
          className="grid h-11 w-8 place-items-center"
        >
          <span
            className={`h-5 w-5 rounded-full ring-1 ring-[var(--awb-border)] ${
              current === color.toLowerCase() ? "outline outline-2 outline-offset-2 outline-[var(--awb-accent)]" : ""
            }`}
            style={{ background: color }}
          />
        </button>
      ))}
    </div>
  );
  return inline ? <EditBarPanelRequest id={`pdf-tool-palette-${activeTool}`} label={tt("颜色")} triggerSelector={`[data-workspace-action-id="${triggerId}"]`} onClose={() => setClosed(true)}>{palette}</EditBarPanelRequest> : palette;
}
