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
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface,#f5f5f4)]">
      <style>{RICHDOC_CSS}</style>
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8">
        <div className="relative mx-auto min-h-full max-w-[860px] rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-8 py-10 shadow-sm sm:px-14">
          {editor.loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--card,#fff)]/90">
              <p className="text-[12px] text-[var(--muted,#78716c)]">
                {tt("正在载入文档…")}
              </p>
            </div>
          )}
          <EditorContent editor={editor.editor} className="min-h-[720px]" />
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-4">
        <span className="text-[10px] tabular-nums text-[var(--muted,#78716c)]">
          {tt("{words} 字 · {chars} 字符", {
            words: editor.words,
            chars: editor.chars,
          })}
        </span>
        <span className="min-w-[120px] flex-1 truncate text-[10px] text-[var(--muted,#78716c)]">
          {editor.error
            ? tt(editor.error)
            : editor.savedUrl
              ? tt("已保存到我的库")
              : tt("编辑不会覆盖原素材")}
        </span>
      </div>
    </div>
  );
}
