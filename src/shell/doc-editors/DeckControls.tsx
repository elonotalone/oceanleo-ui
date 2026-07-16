"use client";

import { useUI } from "../../i18n/ui/useUI";
import { DECK_THEMES } from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[11px] text-stone-700 outline-none focus:border-stone-400";
const buttonClass =
  "rounded-lg border border-stone-200 px-2 py-2 text-[10px] text-stone-600 hover:bg-stone-50 disabled:opacity-35";

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
          <label className="block text-[10px] font-medium text-stone-500">
            {tt("标题")}
            <input
              value={editor.deck.title}
              onChange={(event) => editor.setTitle(event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
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
          <div className="grid grid-cols-2 gap-1.5">
            {DECK_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => editor.setTheme(theme.id)}
                className="flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-[10px]"
                style={
                  editor.deck.theme === theme.id
                    ? {
                        borderColor: theme.accent,
                        color: theme.text,
                        background: theme.background,
                      }
                    : { borderColor: "#e7e5e4", color: "#78716c" }
                }
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ background: theme.accent }}
                />
                {tt(theme.label)}
              </button>
            ))}
          </div>
        </div>
      </details>

      <details open className="border-b border-stone-100">
        <summary className="cursor-pointer px-3 py-2.5 text-[11px] font-semibold text-stone-700">
          {tt("添加与图层")}
        </summary>
        <div className="space-y-2.5 px-3 pb-3">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={editor.addTextElement}
              className={buttonClass}
            >
              {tt("添加文字")}
            </button>
            <button
              type="button"
              onClick={() => editor.insertImageElement("", tt("新图片"))}
              className={buttonClass}
            >
              {tt("添加图片")}
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-stone-400">
            {tt("点击页面元素后，文字、位置和样式会直接出现在幻灯片上方。")}
          </p>
          {slide.elements.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-stone-100 p-1">
              {[...slide.elements]
                .sort((left, right) => right.order - left.order)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => editor.selectElement(item.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px]"
                    style={
                      item.id === editor.selectedElementId
                        ? { color: accent, background: `${accent}0d` }
                        : { color: "#78716c" }
                    }
                  >
                    <span className="w-8 shrink-0 uppercase text-[8px] text-stone-400">
                      {item.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {item.text || item.alt || item.label || tt("未命名元素")}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      </details>

      <div className="space-y-2 p-3">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={editor.addSlide} className={buttonClass}>
            {tt("新增幻灯片")}
          </button>
          <button
            type="button"
            onClick={editor.duplicateSlide}
            className={buttonClass}
          >
            {tt("复制幻灯片")}
          </button>
          <button
            type="button"
            disabled={editor.activeIndex === 0}
            onClick={() => editor.moveSlide(-1)}
            className={buttonClass}
          >
            {tt("向前移动")}
          </button>
          <button
            type="button"
            disabled={editor.activeIndex === editor.deck.slides.length - 1}
            onClick={() => editor.moveSlide(1)}
            className={buttonClass}
          >
            {tt("向后移动")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!editor.canUndo}
            onClick={editor.undo}
            className={buttonClass}
          >
            {tt("撤销")}
          </button>
          <button
            type="button"
            disabled={!editor.canRedo}
            onClick={editor.redo}
            className={buttonClass}
          >
            {tt("重做")}
          </button>
        </div>
      </div>
    </div>
  );
}
