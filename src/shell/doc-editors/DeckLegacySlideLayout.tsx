"use client";

import { useUI } from "../../i18n/ui/useUI";
import {
  deckMasterFor,
  deckTheme,
  type DeckSlide,
} from "./deck-schema";
import { deckTextGestureProps } from "./deck-text-gesture";
import type { DeckEditorState } from "./use-deck-editor";

export function DeckLegacySlideLayout({
  editor,
  slide,
}: {
  editor: DeckEditorState;
  slide: DeckSlide;
}) {
  const tt = useUI();
  const theme = deckTheme(editor.deck.theme);
  const master = deckMasterFor(editor.deck, slide);
  const isCenter = slide.layout === "title" || slide.layout === "section";
  const hasImage = slide.layout === "image-left" || slide.layout === "image-right";
  const imageLeft = slide.layout === "image-left";

  const textPanel = (
    <div className={`flex min-w-0 flex-1 flex-col ${isCenter ? "items-center justify-center text-center" : "justify-start"}`}>
      <textarea
        aria-label={tt("幻灯片标题")}
        data-deck-edit-text
        value={slide.title}
        rows={isCenter ? 2 : 1}
        {...deckTextGestureProps(editor, "title")}
        placeholder={tt("输入标题")}
        className={`w-full resize-none overflow-hidden bg-transparent font-bold outline-none placeholder:opacity-30 ${
          isCenter ? "text-center text-[clamp(24px,4vw,54px)]" : "text-[clamp(20px,3vw,38px)]"
        }`}
        style={{
          color: master.textColor || theme.text,
          fontFamily: master.fontFamily || theme.fontFamily,
        }}
      />
      {slide.layout !== "blank" && (
        <textarea
          aria-label={tt("幻灯片正文")}
          value={slide.body}
          rows={isCenter ? 3 : 5}
          {...deckTextGestureProps(editor, "body")}
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
              <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: master.accentColor || theme.accent }} />
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
      data-deck-canvas
      className="relative flex h-full w-full overflow-hidden rounded-lg p-[clamp(28px,5vw,72px)] shadow-2xl"
      style={{
        background: slide.background || master.background || theme.background,
        color: master.textColor || theme.text,
        fontFamily: master.fontFamily || theme.fontFamily,
      }}
    >
      <div
        className="absolute left-[clamp(28px,5vw,72px)] top-[clamp(20px,3vw,44px)] h-1 w-14 rounded-full"
        style={{ background: master.accentColor || theme.accent }}
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
