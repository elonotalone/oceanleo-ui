"use client";

import { EditorContent } from "@tiptap/react";
import { useUI } from "../../i18n/ui/useUI";
import { RICHDOC_CSS } from "./rich-doc-model";
import type { RichDocEditorState } from "./use-rich-doc-editor";

export function RichDocStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: RichDocEditorState;
  accent?: string;
}) {
  const tt = useUI();
  return (
    <div
      role="region"
      aria-label={tt("文档编辑器")}
      aria-busy={editor.loading}
      className="flex h-full min-h-0 flex-col bg-[var(--surface,#f5f5f4)]"
    >
      <style>{RICHDOC_CSS}</style>
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8">
        <div className="relative mx-auto min-h-full max-w-[860px] rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-8 py-10 shadow-sm sm:px-14">
          {editor.loading && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--card,#fff)]/90"
            >
              <p className="text-[12px] text-[var(--muted,#78716c)]">
                {tt("正在载入文档…")}
              </p>
            </div>
          )}
          {!editor.loading && editor.error && (
            <div
              role="alert"
              className="absolute inset-x-6 top-4 z-20 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700"
            >
              {tt(editor.error)}
            </div>
          )}
          {!editor.loading && !editor.error && editor.chars === 0 && (
            <p
              role="status"
              className="pointer-events-none absolute inset-x-8 top-12 text-[12px] text-[var(--muted,#78716c)]"
            >
              {tt("空白文档，开始输入内容")}
            </p>
          )}
          <EditorContent
            editor={editor.editor}
            aria-label={tt("文档编辑区")}
            className="min-h-[720px]"
          />
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-4">
        <span className="text-[10px] tabular-nums text-[var(--muted,#78716c)]">
          {tt("{words} 字 · {chars} 字符", {
            words: editor.words,
            chars: editor.chars,
          })}
        </span>
        {editor.error && (
          <span
            role="alert"
            className="min-w-[120px] flex-1 truncate text-[10px] text-red-600"
          >
            {tt(editor.error)}
          </span>
        )}
      </div>
    </div>
  );
}
