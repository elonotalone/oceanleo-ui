"use client";

import { useEffect } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME } from "../editor-chrome";
import type { FabricImageEditorState } from "./types";

function Action({
  children,
  onClick,
  disabled,
  active,
  accent,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  accent?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition disabled:opacity-35 ${CHROME.hover}`}
      style={
        active
          ? { borderColor: accent, color: accent, background: `${accent}12` }
          : { borderColor: "var(--border,#e7e5e4)", color: "var(--fg-2,#57534e)" }
      }
    >
      {children}
    </button>
  );
}

export function FabricImageStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: FabricImageEditorState;
  accent?: string;
}) {
  const tt = useUI();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']") ||
        editor.loading
      ) {
        return;
      }
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        editor.redo();
      } else if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void editor.duplicateSelected();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        editor.deleteSelected();
      } else if (event.key.toLowerCase() === "v") {
        editor.setActiveTool("select");
      } else if (event.key.toLowerCase() === "b") {
        editor.setActiveTool("draw");
      } else if (event.key.toLowerCase() === "e") {
        editor.setActiveTool("erase");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  return (
    <div className={`flex h-full min-h-0 flex-col ${CHROME.subtle}`}>
      <div className={`flex shrink-0 flex-wrap items-center gap-1.5 border-b ${CHROME.border} ${CHROME.surface} px-3 py-2`}>
        <Action label={tt("撤销")} disabled={!editor.canUndo} onClick={editor.undo}>↶</Action>
        <Action label={tt("重做")} disabled={!editor.canRedo} onClick={editor.redo}>↷</Action>
        <span className={`mx-1 h-5 w-px ${CHROME.divider}`} />
        <Action accent={accent} active={editor.activeTool === "select"} onClick={() => editor.setActiveTool("select")}>{tt("选择 V")}</Action>
        <Action accent={accent} active={editor.activeTool === "draw"} onClick={() => editor.setActiveTool("draw")}>{tt("画笔 B")}</Action>
        <Action accent={accent} active={editor.activeTool === "erase"} onClick={() => editor.setActiveTool("erase")}>{tt("橡皮 E")}</Action>
        <span className={`mx-1 h-5 w-px ${CHROME.divider}`} />
        <Action onClick={editor.zoomOut}>−</Action>
        <span className={`w-12 text-center text-[10px] tabular-nums ${CHROME.muted}`}>{Math.round(editor.zoom * 100)}%</span>
        <Action onClick={editor.zoomIn}>＋</Action>
        <Action onClick={editor.zoomFit}>{tt("适应")}</Action>
        <Action onClick={editor.zoomTo100}>100%</Action>
        <span className="min-w-0 flex-1" />
        <span className={`text-[10px] tabular-nums ${CHROME.muted}`}>
          {editor.doc.width} × {editor.doc.height}
        </span>
      </div>

      <div
        ref={editor.stageContainerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{
          backgroundColor: "#e7e5e4",
          backgroundImage:
            "linear-gradient(45deg,#d6d3d1 25%,transparent 25%),linear-gradient(-45deg,#d6d3d1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d6d3d1 75%),linear-gradient(-45deg,transparent 75%,#d6d3d1 75%)",
          backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
          backgroundSize: "16px 16px",
        }}
      >
        <canvas ref={editor.stageCanvasRef} aria-label={tt("图片编辑画布")} />
        {editor.loading && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[var(--card,#ffffff)]/85">
            <div className="text-center">
              <div
                className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--border,#e7e5e4)]"
                style={{ borderTopColor: accent }}
              />
              <p className={`mt-3 text-[11px] ${CHROME.muted}`}>{tt("正在载入对象化图片画布…")}</p>
            </div>
          </div>
        )}
        {editor.cropping && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-[var(--fg,#0c0a09)]/80 px-3 py-1 text-[10px] text-[var(--card,#ffffff)]">
            {tt("拖动裁剪框，完成后在对象上方点击“应用裁剪”")}
          </div>
        )}
      </div>

      <div className={`flex shrink-0 flex-wrap items-center gap-2 border-t ${CHROME.border} ${CHROME.surface} px-4 py-2.5`}>
        <span
          role="status"
          className={`min-w-0 flex-1 truncate text-[11px] ${
            editor.error ? "text-rose-500" : CHROME.muted
          }`}
        >
          {editor.error ||
            editor.notice ||
            (editor.selected
              ? tt("已选中 {kind} 图层", { kind: editor.selected.kind })
              : tt("选择对象后可在对象上方调整属性；Alt/中键拖动画布"))}
        </span>
        <button
          type="button"
          onClick={editor.download}
          disabled={editor.loading}
          className={`rounded-lg border px-3 py-1.5 text-[11px] transition ${CHROME.border} ${CHROME.fg2} ${CHROME.hover} disabled:opacity-40`}
        >
          {tt("下载")}
        </button>
        <button
          type="button"
          onClick={() => void editor.save()}
          disabled={editor.loading || editor.saving}
          className="rounded-lg px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
          style={{ background: accent }}
        >
          {editor.saving ? tt("保存中…") : tt("保存到我的库")}
        </button>
      </div>
    </div>
  );
}
