"use client";

// One card for home asset cards and inspiration cards (wave 2026-11-21, unit UH): image on top (3:2), title, one line.
// The whole card is one native button laid over the card; it is the FIRST button in the DOM so callers and tests that
// look for "the card's button" hit the main action. Optional controls (a "prompt" chip, an edit pencil) sit above it.
// Home and inspirations import this file only, so the two cannot drift.

import { useState, type CSSProperties, type ReactNode } from "react";

/** Home keeps its column rule (1 → 2 → 3 by viewport). */
export const MEDIA_CARD_HOME_GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";
/** Right panel: two columns, one when the panel is narrower than two 10rem cards. Inline so no new CSS is needed. */
export const MEDIA_CARD_PANEL_GRID_STYLE: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fill, minmax(max(10rem, calc((100% - 0.75rem) / 2)), 1fr))",
};
const IMAGE_STYLE: CSSProperties = { aspectRatio: "3 / 2" };

export interface MediaCardAction {
  label: string;
  onClick: () => void;
}

type DataHooks = Record<`data-${string}`, string | boolean | undefined>;

export interface MediaCardProps {
  title: string;
  /** One line under the title (clamped to one line). */
  line?: string;
  /** Ready `<img src>`. Empty / null = the same card without the image area. */
  image?: string | null;
  /** Small glyph before the title (custom prompt cards keep their chosen emoji). */
  icon?: ReactNode;
  /** The whole card's action. Absent = a static card (no button). */
  onClick?: () => void;
  /** Accessible name of the card button; defaults to the title. */
  actionLabel?: string;
  /** A second, independent control beside the title (home: "prompt" fills the input box). */
  action?: MediaCardAction | null;
  /** Caller-positioned extra controls (e.g. an edit pencil, `absolute right-1.5 top-1.5`). */
  extra?: ReactNode;
  /** Hooks on the root element. */
  hooks?: DataHooks;
  /** Hooks on the card button. */
  buttonHooks?: DataHooks;
}

export function MediaCard({ title, line, image, icon, onClick, actionLabel, action, extra, hooks, buttonHooks }: MediaCardProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = image && image !== failed ? image : "";
  return (
    <div
      data-media-card
      {...hooks}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-stone-300 hover:shadow-md focus-within:border-stone-300"
    >
      {onClick ? (
        <button
          type="button"
          data-media-card-main
          {...buttonHooks}
          onClick={onClick}
          aria-label={actionLabel ?? title}
          className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400"
        />
      ) : null}
      {image ? (
        <span data-media-card-image className="block w-full overflow-hidden bg-stone-100" style={IMAGE_STYLE}>
          {src ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)}
              className="h-full w-full object-cover" />
          ) : null}
        </span>
      ) : null}
      {/* A caller-positioned control sits in the top-right corner; without an image that corner is the title row. */}
      <span className={`flex min-w-0 flex-col gap-0.5 px-3 py-2.5${extra && !image ? " pr-9" : ""}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          {icon ? <span aria-hidden="true" className="shrink-0 text-[14px] leading-none">{icon}</span> : null}
          <span data-media-card-title className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-800">{title}</span>
          {action ? (
            <button
              type="button"
              data-media-card-action
              data-app-card-primary
              onClick={action.onClick}
              className="relative shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600 opacity-0 transition-opacity duration-[var(--leo-dur-2)] hover:bg-stone-50 hover:text-stone-900 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
            >
              {action.label}
            </button>
          ) : null}
        </span>
        {line ? <span data-media-card-line className="truncate text-[12px] leading-snug text-stone-500">{line}</span> : null}
      </span>
      {extra}
    </div>
  );
}
