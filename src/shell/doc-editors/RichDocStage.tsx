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
    <div className="flex h-full min-h-0 flex-col bg-stone-100">
      <style>{RICHDOC_CSS}</style>
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8">
        <div className="relative mx-auto min-h-full max-w-[860px] rounded-xl border border-stone-200 bg-white px-8 py-10 shadow-sm sm:px-14">
          {editor.loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/90">
              <p className="text-[12px] text-stone-400">
                {tt("正在载入文档…")}
              </p>
            </div>
          )}
          <EditorContent editor={editor.editor} className="min-h-[720px]" />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-stone-200 bg-white px-4 py-2.5">
        <span className="text-[11px] tabular-nums text-stone-400">
          {tt("{words} 字 · {chars} 字符", {
            words: editor.words,
            chars: editor.chars,
          })}
        </span>
        <span className="min-w-[120px] flex-1 truncate text-[11px] text-stone-400">
          {editor.error
            ? tt(editor.error)
            : editor.savedUrl
              ? tt("已保存到我的库")
              : tt("编辑不会覆盖原素材")}
        </span>
        <button
          type="button"
          disabled={!editor.editor || editor.loading}
          onClick={() => void editor.exportMarkdown()}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
        >
          {tt("导出 Markdown")}
        </button>
        <button
          type="button"
          disabled={!editor.editor || editor.loading}
          onClick={() => void editor.exportHtml()}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
        >
          {tt("导出 HTML")}
        </button>
        <button
          type="button"
          disabled={!editor.editor || editor.loading}
          onClick={editor.exportText}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
        >
          {tt("导出 TXT")}
        </button>
        <button
          type="button"
          disabled={editor.saving || editor.loading || !editor.editor}
          onClick={() => void editor.save()}
          className="rounded-lg px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {editor.saving ? tt("保存中…") : tt("保存到我的库")}
        </button>
      </div>
    </div>
  );
}
