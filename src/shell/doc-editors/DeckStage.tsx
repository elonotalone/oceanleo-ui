"use client";

import { useEffect } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { deckTheme, type DeckSlide } from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

function MiniSlide({
  slide,
  number,
  active,
  theme,
  onClick,
}: {
  slide: DeckSlide;
  number: number;
  active: boolean;
  theme: ReturnType<typeof deckTheme>;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-start gap-2 text-left">
      <span className="w-5 shrink-0 pt-5 text-right text-[9px] text-stone-400">{number}</span>
      <span
        className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded border p-2 shadow-sm"
        style={{
          borderColor: active ? theme.accent : "#d6d3d1",
          boxShadow: active ? `0 0 0 2px ${theme.accent}22` : undefined,
          background: slide.background || theme.background,
          color: theme.text,
          fontFamily: theme.fontFamily,
        }}
      >
        {slide.image?.url && (
          <img src={slide.image.url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
        )}
        <span className="relative block truncate text-[6px] font-bold">{slide.title || " "}</span>
        <span className="relative mt-1 block line-clamp-3 text-[4px] opacity-65">{slide.body || slide.bullets.join(" · ")}</span>
      </span>
    </button>
  );
}

function SlideCanvas({
  editor,
}: {
  editor: DeckEditorState;
}) {
  const tt = useUI();
  const slide = editor.activeSlide;
  const theme = deckTheme(editor.deck.theme);
  const isCenter = slide.layout === "title" || slide.layout === "section";
  const hasImage = slide.layout === "image-left" || slide.layout === "image-right";
  const imageLeft = slide.layout === "image-left";

  const textPanel = (
    <div className={`flex min-w-0 flex-1 flex-col ${isCenter ? "items-center justify-center text-center" : "justify-start"}`}>
      <textarea
        aria-label={tt("幻灯片标题")}
        value={slide.title}
        rows={isCenter ? 2 : 1}
        onChange={(event) => editor.patchSlide({ title: event.target.value })}
        placeholder={tt("输入标题")}
        className={`w-full resize-none overflow-hidden bg-transparent font-bold outline-none placeholder:opacity-30 ${
          isCenter ? "text-center text-[clamp(24px,4vw,54px)]" : "text-[clamp(20px,3vw,38px)]"
        }`}
        style={{ color: theme.text, fontFamily: theme.fontFamily }}
      />
      {slide.layout !== "blank" && (
        <textarea
          aria-label={tt("幻灯片正文")}
          value={slide.body}
          rows={isCenter ? 3 : 5}
          onChange={(event) => editor.patchSlide({ body: event.target.value })}
          placeholder={tt("输入正文")}
          className={`mt-3 w-full resize-none bg-transparent text-[clamp(12px,1.6vw,21px)] leading-relaxed outline-none placeholder:opacity-30 ${
            isCenter ? "text-center" : "text-left"
          }`}
          style={{ color: theme.muted, fontFamily: theme.fontFamily }}
        />
      )}
      {slide.layout !== "blank" && slide.bullets.length > 0 && (
        <ul className={`mt-4 w-full space-y-2 text-[clamp(12px,1.5vw,20px)] ${isCenter ? "text-left" : ""}`} style={{ color: theme.text }}>
          {slide.bullets.map((bullet, index) => (
            <li key={`${index}-${bullet}`} className="flex gap-3">
              <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: theme.accent }} />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const imagePanel = hasImage ? (
    <div
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[min(2vw,24px)]"
      style={{ background: theme.surface }}
    >
      {slide.image?.url ? (
        <img
          src={slide.image.url}
          alt={slide.image.alt || ""}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full min-h-40 place-items-center border border-dashed border-current/20 text-[12px] opacity-45">
          {tt("在左侧添加配图 URL")}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      className="relative flex h-full w-full overflow-hidden rounded-lg p-[clamp(28px,5vw,72px)] shadow-2xl"
      style={{
        background: slide.background || theme.background,
        color: theme.text,
        fontFamily: theme.fontFamily,
      }}
    >
      <div
        className="absolute left-[clamp(28px,5vw,72px)] top-[clamp(20px,3vw,44px)] h-1 w-14 rounded-full"
        style={{ background: theme.accent }}
      />
      <div className={`flex min-h-0 w-full gap-[clamp(24px,4vw,64px)] ${hasImage ? "" : "items-stretch"}`}>
        {imageLeft && imagePanel}
        {textPanel}
        {!imageLeft && imagePanel}
      </div>
      <span className="absolute bottom-4 right-5 text-[10px] opacity-40">
        {editor.activeIndex + 1} / {editor.deck.slides.length}
      </span>
    </div>
  );
}

export function DeckStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: DeckEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const theme = deckTheme(editor.deck.theme);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        const previous = editor.deck.slides[editor.activeIndex - 1];
        if (previous) editor.selectSlide(previous.id);
      } else if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        const next = editor.deck.slides[editor.activeIndex + 1];
        if (next) editor.selectSlide(next.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-100">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-stone-200 bg-white px-3 py-2">
        <button type="button" onClick={editor.undo} disabled={!editor.canUndo} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-600 disabled:opacity-35">↶</button>
        <button type="button" onClick={editor.redo} disabled={!editor.canRedo} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-600 disabled:opacity-35">↷</button>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <button type="button" onClick={editor.addSlide} className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] text-stone-600">{tt("新建一页")}</button>
        <button type="button" onClick={editor.duplicateSlide} className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] text-stone-600">{tt("复制当前页")}</button>
        <span className="min-w-0 flex-1 truncate px-3 text-center text-[11px] font-medium text-stone-500">{editor.deck.title}</span>
        <span className="text-[10px] text-stone-400">{editor.deck.aspect}</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-44 shrink-0 overflow-y-auto border-r border-stone-200 bg-stone-50 p-2.5">
          <div className="space-y-2.5">
            {editor.deck.slides.map((slide, index) => (
              <MiniSlide
                key={slide.id}
                slide={slide}
                number={index + 1}
                active={slide.id === editor.activeSlide.id}
                theme={theme}
                onClick={() => editor.selectSlide(slide.id)}
              />
            ))}
          </div>
        </aside>
        <main className="relative grid min-h-0 min-w-0 flex-1 place-items-center overflow-auto p-6 lg:p-10">
          <div
            className="w-full max-w-5xl"
            style={{ aspectRatio: editor.deck.aspect === "4:3" ? "4 / 3" : "16 / 9" }}
          >
            <SlideCanvas editor={editor} />
          </div>
          {editor.loading && (
            <div className="absolute inset-0 grid place-items-center bg-white/85 text-[12px] text-stone-500">
              {tt("正在载入演示文稿…")}
            </div>
          )}
        </main>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-stone-200 bg-white px-4 py-2.5">
        <span role="status" className={`min-w-0 flex-1 truncate text-[11px] ${editor.error ? "text-red-600" : "text-stone-500"}`}>
          {editor.error ||
            editor.notice ||
            tt("第 {page} 页，共 {total} 页", {
              page: editor.activeIndex + 1,
              total: editor.deck.slides.length,
            })}
        </span>
        <button type="button" onClick={editor.downloadJson} className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] text-stone-600">{tt("下载工程")}</button>
        <button type="button" disabled={editor.exporting} onClick={() => void editor.exportPptx()} className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] text-stone-600 disabled:opacity-40">
          {editor.exporting ? tt("导出中…") : tt("导出 PPTX")}
        </button>
        <button type="button" disabled={editor.saving} onClick={() => void editor.save()} className="rounded-lg px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
          {editor.saving ? tt("保存中…") : tt("保存到我的库")}
        </button>
      </div>
    </div>
  );
}
