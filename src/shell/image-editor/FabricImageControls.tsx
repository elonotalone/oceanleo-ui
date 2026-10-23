"use client";

import { useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  CANVAS_PRESETS,
  type FabricImageEditorState,
} from "./types";

export type FabricImageControlSection =
  | "layers"
  | "canvas";

function Section({
  title,
  children,
  open = true,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="border-b border-[var(--border,#e7e5e4)]">
      <summary className="cursor-pointer select-none px-4 py-3 text-[11px] font-semibold text-[var(--fg,#292524)]">
        {title}
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

function ToolButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-2.5 py-2 text-[10px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 disabled:opacity-40 ${
 active
 ? "border-[var(--awb-accent,#7c3aed)] bg-[var(--awb-accent,#7c3aed)] text-[var(--awb-on-accent,#fff)] shadow-sm"
 : "border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:shadow-sm"
 }`}
    >
      {children}
    </button>
  );
}

export function FabricImageControls({
  editor,
  sections = ["layers", "canvas"],
}: {
  editor: FabricImageEditorState;
  sections?: FabricImageControlSection[];
}) {
  const tt = useUI();
  const [customWidth, setCustomWidth] = useState(editor.doc.width);
  const [customHeight, setCustomHeight] = useState(editor.doc.height);
  const hasLockedLayers = editor.layers.some((layer) => layer.locked);
  const has = (section: FabricImageControlSection) =>
    sections.includes(section);

  return (
    <div className="bg-[var(--card,#fff)]">
      {has("layers") && <Section title={tt("图层")}>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {[...editor.layers].reverse().map((layer) => (
            <button
              key={layer.id}
              type="button"
              data-layer-id={layer.id}
              data-layer-kind={layer.kind}
              data-layer-locked={layer.locked ? "true" : "false"}
              data-layer-background={layer.isBackground ? "true" : "false"}
              aria-label={
                layer.isBackground
                  ? tt("背景图层")
                  : layer.locked
                    ? tt("锁定图层")
                    : layer.kind === "image"
                      ? tt("解锁图片图层")
                      : tt("图层")
              }
              onClick={() => editor.selectLayer(layer.id)}
              className={`flex w-full items-center gap-1 rounded-lg border px-2 py-1.5 text-left text-[10px] ${
                layer.selected
                  ? "border-[var(--awb-accent,#7c3aed)] bg-[var(--surface-hover,rgba(0,0,0,.04))]"
                  : "border-[var(--border,#e7e5e4)]"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{layer.name || layer.kind}</span>
              <span
                className={layer.locked ? "pointer-events-none opacity-30" : ""}
                onClick={(event) => { event.stopPropagation(); editor.toggleLayerVisible(layer.id); }}
              >
                {layer.visible ? "◉" : "○"}
              </span>
              <span onClick={(event) => { event.stopPropagation(); editor.toggleLayerLock(layer.id); }}>{layer.locked ? "🔒" : "◇"}</span>
              {!layer.isBackground && (
                <>
                  <span
                    className={layer.locked ? "pointer-events-none opacity-30" : ""}
                    onClick={(event) => { event.stopPropagation(); editor.moveLayer(layer.id, "up"); }}
                  >
                    ↑
                  </span>
                  <span
                    className={layer.locked ? "pointer-events-none opacity-30" : ""}
                    onClick={(event) => { event.stopPropagation(); editor.moveLayer(layer.id, "down"); }}
                  >
                    ↓
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      </Section>}

      {has("canvas") && <Section title={tt("画布")}>
        <div className="grid grid-cols-2 gap-1">
          {CANVAS_PRESETS.map((preset) => (
            <ToolButton
              key={preset.id}
              disabled={hasLockedLayers}
              active={editor.doc.width === preset.width && editor.doc.height === preset.height}
              onClick={() => {
                editor.resizeDoc(preset.width, preset.height);
                setCustomWidth(preset.width);
                setCustomHeight(preset.height);
              }}
            >
              {tt(preset.label)}
            </ToolButton>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1">
          <input type="number" value={customWidth} min={16} max={8192} onChange={(event) => setCustomWidth(Number(event.target.value))} className="min-w-0 rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 py-1.5 text-[10px] text-[var(--fg,#292524)]" />
          <span className="text-[var(--muted,#78716c)]">×</span>
          <input type="number" value={customHeight} min={16} max={8192} onChange={(event) => setCustomHeight(Number(event.target.value))} className="min-w-0 rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 py-1.5 text-[10px] text-[var(--fg,#292524)]" />
          <ToolButton
            disabled={hasLockedLayers}
            onClick={() => editor.resizeDoc(customWidth, customHeight)}
          >
            {tt("应用")}
          </ToolButton>
        </div>
        <label className="flex items-center justify-between text-[10px] text-[var(--muted,#78716c)]">
          {tt("画布背景")}
          <input
            type="color"
            value={editor.canvasBackground}
            onFocus={editor.beginGesture}
            onPointerDown={editor.beginGesture}
            onChange={(event) => {
              editor.beginGesture();
              editor.setCanvasBackground(event.target.value);
            }}
            onPointerUp={editor.endGesture}
            onPointerCancel={editor.cancelGesture}
            onKeyDown={editor.beginGesture}
            onKeyUp={editor.endGesture}
            onBlur={editor.endGesture}
          />
        </label>
      </Section>}

    </div>
  );
}
