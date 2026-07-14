"use client";

import { useUI } from "../../i18n/ui/useUI";
import {
  DECK_THEMES,
  type DeckLayout,
} from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

const LAYOUTS: Array<{ id: DeckLayout; label: string }> = [
  { id: "title", label: "封面标题" },
  { id: "title-body", label: "标题正文" },
  { id: "section", label: "章节页" },
  { id: "bullets", label: "要点列表" },
  { id: "image-left", label: "左图右文" },
  { id: "image-right", label: "左文右图" },
  { id: "blank", label: "空白页" },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium text-stone-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[11px] text-stone-700 outline-none focus:border-stone-400";

export function DeckControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: DeckEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const slide = editor.activeSlide;
  return (
    <div className="h-full overflow-y-auto bg-white">
      <details open className="border-b border-stone-100">
        <summary className="cursor-pointer px-3 py-2.5 text-[11px] font-semibold text-stone-700">
          {tt("演示文稿")}
        </summary>
        <div className="space-y-2.5 px-3 pb-3">
          <Field label={tt("标题")}>
            <input value={editor.deck.title} onChange={(event) => editor.setTitle(event.target.value)} className={inputClass} />
          </Field>
          <Field label={tt("页面比例")}>
            <div className="grid grid-cols-2 gap-1">
              {(["16:9", "4:3"] as const).map((aspect) => (
                <button
                  key={aspect}
                  type="button"
                  onClick={() => editor.setAspect(aspect)}
                  className="rounded-lg border px-2 py-1.5 text-[10px]"
                  style={
                    editor.deck.aspect === aspect
                      ? { borderColor: accent, color: accent, background: `${accent}0d` }
                      : { borderColor: "#e7e5e4", color: "#78716c" }
                  }
                >
                  {aspect}
                </button>
              ))}
            </div>
          </Field>
          <Field label={tt("主题")}>
            <div className="grid grid-cols-2 gap-1.5">
              {DECK_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => editor.setTheme(theme.id)}
                  className="flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-[10px]"
                  style={
                    editor.deck.theme === theme.id
                      ? { borderColor: theme.accent, color: theme.text, background: theme.background }
                      : { borderColor: "#e7e5e4", color: "#78716c" }
                  }
                >
                  <span className="h-4 w-4 rounded-full" style={{ background: theme.accent }} />
                  {tt(theme.label)}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </details>

      <details open className="border-b border-stone-100">
        <summary className="cursor-pointer px-3 py-2.5 text-[11px] font-semibold text-stone-700">
          {tt("当前幻灯片")}
        </summary>
        <div className="space-y-2.5 px-3 pb-3">
          <Field label={tt("版式")}>
            <div className="grid grid-cols-2 gap-1">
              {LAYOUTS.map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => editor.patchSlide({ layout: layout.id })}
                  className="rounded-lg border px-2 py-1.5 text-[10px]"
                  style={
                    slide.layout === layout.id
                      ? { borderColor: accent, color: accent, background: `${accent}0d` }
                      : { borderColor: "#e7e5e4", color: "#78716c" }
                  }
                >
                  {tt(layout.label)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={tt("标题")}>
            <input value={slide.title} onChange={(event) => editor.patchSlide({ title: event.target.value })} className={inputClass} />
          </Field>
          <Field label={tt("正文")}>
            <textarea value={slide.body} rows={5} onChange={(event) => editor.patchSlide({ body: event.target.value })} className={`${inputClass} resize-y`} />
          </Field>
          <Field label={tt("要点（每行一条）")}>
            <textarea
              value={slide.bullets.join("\n")}
              rows={5}
              onChange={(event) =>
                editor.patchSlide({
                  bullets: event.target.value.split(/\r?\n/).slice(0, 100),
                })
              }
              className={`${inputClass} resize-y`}
            />
          </Field>
          <Field label={tt("演讲者备注")}>
            <textarea value={slide.notes} rows={4} onChange={(event) => editor.patchSlide({ notes: event.target.value })} className={`${inputClass} resize-y`} />
          </Field>
          <Field label={tt("单页背景色")}>
            <div className="flex gap-2">
              <input
                type="color"
                value={slide.background || "#ffffff"}
                onChange={(event) => editor.patchSlide({ background: event.target.value })}
                className="h-9 w-12 rounded border border-stone-200"
              />
              <button
                type="button"
                onClick={() => editor.patchSlide({ background: "" })}
                className="flex-1 rounded-lg border border-stone-200 text-[10px] text-stone-500"
              >
                {tt("跟随主题")}
              </button>
            </div>
          </Field>
        </div>
      </details>

      <details open={slide.layout === "image-left" || slide.layout === "image-right"} className="border-b border-stone-100">
        <summary className="cursor-pointer px-3 py-2.5 text-[11px] font-semibold text-stone-700">
          {tt("配图")}
        </summary>
        <div className="space-y-2.5 px-3 pb-3">
          <Field label={tt("图片 URL")}>
            <input
              value={slide.image?.url || ""}
              onChange={(event) =>
                editor.patchSlide({
                  image: event.target.value
                    ? { url: event.target.value, alt: slide.image?.alt || "" }
                    : undefined,
                })
              }
              placeholder="https://…"
              className={inputClass}
            />
          </Field>
          <Field label={tt("替代文字")}>
            <input
              value={slide.image?.alt || ""}
              onChange={(event) =>
                editor.patchSlide({
                  image: {
                    url: slide.image?.url || "",
                    alt: event.target.value,
                  },
                })
              }
              className={inputClass}
            />
          </Field>
        </div>
      </details>

      <div className="space-y-2 p-3">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={editor.addSlide} className="rounded-lg border border-stone-200 px-2 py-2 text-[10px] text-stone-600">
            {tt("新增幻灯片")}
          </button>
          <button type="button" onClick={editor.duplicateSlide} className="rounded-lg border border-stone-200 px-2 py-2 text-[10px] text-stone-600">
            {tt("复制幻灯片")}
          </button>
          <button type="button" disabled={editor.activeIndex === 0} onClick={() => editor.moveSlide(-1)} className="rounded-lg border border-stone-200 px-2 py-2 text-[10px] text-stone-600 disabled:opacity-35">
            {tt("向前移动")}
          </button>
          <button type="button" disabled={editor.activeIndex === editor.deck.slides.length - 1} onClick={() => editor.moveSlide(1)} className="rounded-lg border border-stone-200 px-2 py-2 text-[10px] text-stone-600 disabled:opacity-35">
            {tt("向后移动")}
          </button>
        </div>
        <button
          type="button"
          disabled={editor.deck.slides.length <= 1}
          onClick={editor.deleteSlide}
          className="w-full rounded-lg border border-red-100 px-2 py-2 text-[10px] text-red-600 disabled:opacity-35"
        >
          {tt("删除当前幻灯片")}
        </button>
      </div>
    </div>
  );
}
