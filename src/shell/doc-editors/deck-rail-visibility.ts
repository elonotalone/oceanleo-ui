"use client";

import { useEffect, useState, type RefObject } from "react";

/** Matches DeckPreviewLayout rail content width (159px rail − p-2). */
export const DECK_RAIL_THUMB_CONTENT_WIDTH_PX = 143;
export const DECK_RAIL_THUMB_GAP_PX = 10;

/**
 * How many rail thumbs paint on first screen, including one viewport of
 * overscan below (top of the list has no above-overscan).
 */
export function deckRailFirstPaintCount(
  slideCount: number,
  railViewportPx: number,
  options?: {
    thumbWidthPx?: number;
    aspectRatio?: number;
    gapPx?: number;
    overscanScreens?: number;
  },
): number {
  const n = Math.max(0, Math.floor(slideCount));
  if (n === 0) return 0;
  const thumbWidth = finitePositive(
    options?.thumbWidthPx,
    DECK_RAIL_THUMB_CONTENT_WIDTH_PX,
  );
  const aspect = finitePositive(options?.aspectRatio, 16 / 9);
  const gap = Number.isFinite(options?.gapPx)
    ? Math.max(0, options!.gapPx!)
    : DECK_RAIL_THUMB_GAP_PX;
  const overscanScreens = Number.isFinite(options?.overscanScreens)
    ? Math.max(0, options!.overscanScreens!)
    : 1;
  const stride = thumbWidth / aspect + gap;
  const viewport = finitePositive(railViewportPx, 1);
  const visible = Math.max(1, Math.ceil(viewport / stride));
  const overscan = Math.ceil(visible * overscanScreens);
  return Math.min(n, visible + overscan);
}

function finitePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0
    ? (value as number)
    : fallback;
}

/** True when the rail item intersects the rail (plus one-screen margin). */
export function useDeckRailVisibility(
  targetRef: RefObject<Element | null>,
): boolean {
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const node = targetRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const rail = node.closest("[data-deck-thumbnail-rail]");
    const root = rail instanceof Element ? rail : null;
    const rootHeight =
      (root instanceof HTMLElement && root.clientHeight) ||
      (typeof window !== "undefined" ? window.innerHeight : 240);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((item) => item.target === node);
        if (entry) setVisible(entry.isIntersecting);
      },
      {
        root,
        rootMargin: `${Math.max(0, rootHeight)}px 0px`,
        threshold: 0,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [targetRef]);

  return visible;
}
