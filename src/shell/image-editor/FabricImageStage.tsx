"use client";

import { useEffect } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { FabricImageEditorState } from "./types";

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
    <div
      className="flex h-full min-h-0 flex-col bg-[var(--advanced-stage-bg,#f4f1e8)]"
      data-editor-loading={editor.loading ? "true" : "false"}
      data-editor-layer-count={editor.layers.length}
      data-editor-selected-kind={editor.selected?.kind || ""}
      data-scene-diagnostic={editor.sceneDiagnostic?.code || ""}
      data-scene-dependency={editor.sceneDiagnostic?.dependencyId || ""}
    >
      <div
        ref={editor.stageContainerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ backgroundColor: "var(--advanced-stage-bg,#f4f1e8)" }}
      >
        <canvas ref={editor.stageCanvasRef} aria-label={tt("图片编辑画布")} />
        {editor.loading && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-[var(--advanced-stage-bg,#f4f1e8)]/90">
            <div className="text-center">
              <div
                className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--border,#e7e5e4)]"
                style={{ borderTopColor: accent }}
              />
              <p className="mt-3 text-[11px] text-[var(--muted,#78716c)]">{tt("正在载入对象化图片画布…")}</p>
            </div>
          </div>
        )}
        {editor.cropping && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-[var(--fg,#1c1917)]/85 px-3 py-1 text-[10px] text-[var(--card,#fff)]">
            {tt("拖动裁剪框，完成后点击上方属性栏“应用裁剪”")}
          </div>
        )}
      </div>
    </div>
  );
}
