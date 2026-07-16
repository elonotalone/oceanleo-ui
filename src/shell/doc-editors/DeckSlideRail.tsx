"use client";

import { useUI } from "../../i18n/ui/useUI";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import { DeckMiniSlide } from "./DeckMiniSlide";
import { deckTheme } from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

export function DeckSlideRail({ editor }: { editor: DeckEditorState }) {
  const tt = useUI();
  const theme = deckTheme(editor.deck.theme);
  return (
    <aside className="w-40 shrink-0 overflow-y-auto border-r border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2.5">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted,#78716c)]">
          {tt("页面")}
        </span>
        <button
          type="button"
          onClick={editor.addSlide}
          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--muted,#78716c)] hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
          title={tt("新建一页")}
        >
          <AdvancedEditorIcon name="add" className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2.5">
        {editor.deck.slides.map((slide, index) => (
          <DeckMiniSlide
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
  );
}
