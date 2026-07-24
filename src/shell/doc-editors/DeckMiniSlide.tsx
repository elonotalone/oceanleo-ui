"use client";

import {
  deckTheme,
  type DeckMaster,
  type DeckSlide,
} from "./deck-schema";
import { MiniDeckElementLayer } from "./DeckElementContent";

export function DeckMiniSlide({
  slide,
  number,
  active,
  theme,
  master,
  onClick,
}: {
  slide: DeckSlide;
  number: number;
  active: boolean;
  theme: ReturnType<typeof deckTheme>;
  master: DeckMaster;
  onClick?: () => void;
}) {
  const preview = (
    <>
      <span className="w-5 shrink-0 pt-5 text-right text-[9px] text-[var(--muted,#a8a29e)]">
        {number}
      </span>
      <span
        className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded border p-2 shadow-sm"
        style={{
          borderColor: active ? theme.accent : "#d6d3d1",
          boxShadow: active ? `0 0 0 2px ${theme.accent}22` : undefined,
          background: slide.background || master.background || theme.background,
          color: master.textColor || theme.text,
          fontFamily: master.fontFamily || theme.fontFamily,
        }}
      >
        {slide.elements.length ? (
          <MiniDeckElementLayer slide={slide} />
        ) : (
          <>
            {slide.image?.url && (
              <img
                src={slide.image.url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-20"
              />
            )}
            <span className="relative block truncate text-[6px] font-bold">
              {slide.title || " "}
            </span>
            <span className="relative mt-1 block line-clamp-3 text-[4px] opacity-65">
              {slide.body || slide.bullets.join(" · ")}
            </span>
          </>
        )}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <span className="group flex w-full items-start gap-1 text-left">
        {preview}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-2 text-left"
    >
      {preview}
    </button>
  );
}
