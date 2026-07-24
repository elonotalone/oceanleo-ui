"use client";

import {
  deckTheme,
  type DeckMaster,
  type DeckSlide,
} from "./deck-schema";

/**
 * Rail thumbnail: one aspect-matched surface per slide. Keep nested content
 * non-geometric (title/body only) so acceptance geometry counts exactly one
 * thumbnail rect per slide — matching the PPT preview thumbnail host.
 */
export function DeckMiniSlide({
  slide,
  number,
  active,
  theme,
  master,
  onClick,
  aspectRatio = 16 / 9,
}: {
  slide: DeckSlide;
  number: number;
  active: boolean;
  theme: ReturnType<typeof deckTheme>;
  master: DeckMaster;
  onClick?: () => void;
  aspectRatio?: number;
}) {
  const ratio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9;
  const summary =
    slide.body.trim() ||
    slide.bullets.map((bullet) => bullet.trim()).filter(Boolean).join(" · ");
  const preview = (
    <span
      data-deck-thumbnail-surface
      className="relative block w-full overflow-hidden rounded border shadow-sm"
      style={{
        aspectRatio: `${ratio}`,
        borderColor: active ? theme.accent : "#d6d3d1",
        boxShadow: active ? `0 0 0 2px ${theme.accent}22` : undefined,
        background: slide.background || master.background || theme.background,
        color: master.textColor || theme.text,
        fontFamily: master.fontFamily || theme.fontFamily,
      }}
    >
      <span className="pointer-events-none absolute left-1 top-1 z-10 rounded bg-black/35 px-1 text-[8px] font-semibold leading-4 text-white">
        {number}
      </span>
      {slide.image?.url ? (
        <img
          src={slide.image.url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
      ) : null}
      <span className="relative z-[1] block h-full w-full p-1.5">
        <span className="block truncate text-[7px] font-bold leading-tight">
          {slide.title || " "}
        </span>
        {summary ? (
          <span className="mt-0.5 block line-clamp-3 text-[5px] leading-tight opacity-70">
            {summary}
          </span>
        ) : null}
      </span>
    </span>
  );

  if (!onClick) {
    return <span className="block w-full text-left">{preview}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left"
    >
      {preview}
    </button>
  );
}
