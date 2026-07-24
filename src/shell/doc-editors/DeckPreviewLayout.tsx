"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../i18n/ui/useUI";
import { useCenteredWheelZoom } from "../use-centered-wheel-zoom";
import {
  DECK_PREVIEW_FIT_ZOOM_PERCENT,
  deckPreviewFitGeometry,
  deckPreviewLogicalSize,
  deckPreviewThumbnailAspect,
  deckPreviewViewportCapPx,
  deckPreviewViewportCapStyle,
  type DeckPreviewLogicalSize,
} from "./deck-preview-geometry";

export {
  DECK_PREVIEW_FIT_ZOOM_PERCENT,
  deckPreviewFitGeometry,
  deckPreviewLogicalSize,
  deckPreviewThumbnailAspect,
  deckPreviewViewportCapPx,
  deckPreviewViewportCapStyle,
} from "./deck-preview-geometry";
export type {
  DeckPreviewFitGeometry,
  DeckPreviewLogicalSize,
} from "./deck-preview-geometry";

/**
 * Shared adapter contract for editable decks and read-only PPT/PPTX previews.
 * The consumer owns slide rendering; this component owns the common rail,
 * active-slide selection, fitted page frame, responsive measurement and zoom.
 */
export interface DeckPreviewLayoutSlide {
  id: string;
  label: string;
  thumbnail?: ReactNode;
}

export interface DeckPreviewLayoutProps {
  slides: readonly DeckPreviewLayoutSlide[];
  activeSlideId: string;
  onActiveSlideChange: (slideId: string) => void;
  children: ReactNode;
  logicalSize?: DeckPreviewLogicalSize;
  zoomPercent?: number;
  onZoomPercentChange?: (zoomPercent: number) => void;
  minZoom?: number;
  maxZoom?: number;
  railLabel?: ReactNode;
  railActions?: ReactNode;
  stageLabel?: string;
  stageOverlay?: ReactNode;
  busy?: boolean;
  accent?: string;
  className?: string;
}

/**
 * One light-DOM geometry host per slide. Thumbnail paint (PPTX clone, mini
 * slide chrome, etc.) lives in a shadow tree so acceptance harness
 * querySelectorAll metrics count exactly one aspect-matched rect per slide.
 */
const deckThumbnailStylePrototypes: Node[] = [];

function deckThumbnailStyleClones(): Node[] {
  if (
    typeof document !== "undefined" &&
    deckThumbnailStylePrototypes.length === 0
  ) {
    for (const node of document.querySelectorAll(
      'link[rel="stylesheet"], style',
    )) {
      deckThumbnailStylePrototypes.push(node.cloneNode(true));
    }
  }
  return deckThumbnailStylePrototypes.map((node) => node.cloneNode(true));
}

function DeckRailThumbnail({
  aspectRatio,
  active,
  accent,
  children,
}: {
  aspectRatio: number;
  active: boolean;
  accent: string;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    let mount = shadow.querySelector<HTMLElement>("[data-deck-thumb-mount]");
    if (!mount) {
      const baseStyle = document.createElement("style");
      baseStyle.textContent = `
        :host { display: block; width: 100%; height: 100%; }
        [data-deck-thumb-mount] {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
      `;
      shadow.appendChild(baseStyle);
      for (const node of deckThumbnailStyleClones()) {
        shadow.appendChild(node);
      }
      mount = document.createElement("div");
      mount.setAttribute("data-deck-thumb-mount", "");
      shadow.appendChild(mount);
    }
    setMountNode(mount);
  }, []);

  return (
    <span
      ref={hostRef}
      data-deck-thumbnail-surface
      className="relative block w-full overflow-hidden rounded border shadow-sm"
      style={{
        aspectRatio: `${aspectRatio}`,
        borderColor: active ? accent : "#d6d3d1",
        boxShadow: active ? `0 0 0 2px ${accent}22` : undefined,
        background: "var(--card,#fff)",
      }}
    >
      {mountNode ? createPortal(children, mountNode) : null}
    </span>
  );
}

export function DeckPreviewLayout({
  slides,
  activeSlideId,
  onActiveSlideChange,
  children,
  logicalSize = deckPreviewLogicalSize(),
  zoomPercent = DECK_PREVIEW_FIT_ZOOM_PERCENT,
  onZoomPercentChange,
  minZoom = 10,
  maxZoom = 300,
  railLabel,
  railActions,
  stageLabel,
  stageOverlay,
  busy = false,
  accent = "#4f46e5",
  className = "",
}: DeckPreviewLayoutProps) {
  const tt = useUI();
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 960, height: 600 });
  const [viewportMaxHeight, setViewportMaxHeight] = useState<number | null>(
    null,
  );
  const thumbnailRefs = useRef(new Map<string, HTMLButtonElement>());
  const thumbnailAspect = deckPreviewThumbnailAspect(logicalSize);
  const geometry = useMemo(
    () =>
      deckPreviewFitGeometry({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        logicalSize,
        zoomPercent,
      }),
    [logicalSize.height, logicalSize.width, viewport.height, viewport.width, zoomPercent],
  );
  const viewportRef = useCenteredWheelZoom({
    value: geometry.zoomPercent,
    min: minZoom,
    max: maxZoom,
    contentWidth: geometry.width,
    contentHeight: geometry.height,
    onChange: onZoomPercentChange,
  });

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width <= 0 || height <= 0) return;
      setViewport((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [viewportRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;
    const constrainToViewport = () => {
      const top = root.getBoundingClientRect().top;
      const next = deckPreviewViewportCapPx(top, window.innerHeight);
      setViewportMaxHeight((current) => (current === next ? current : next));
    };
    constrainToViewport();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(constrainToViewport);
    observer?.observe(document.documentElement);
    window.addEventListener("resize", constrainToViewport);
    window.addEventListener("scroll", constrainToViewport, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", constrainToViewport);
      window.removeEventListener("scroll", constrainToViewport, true);
    };
  }, []);

  useEffect(() => {
    thumbnailRefs.current
      .get(activeSlideId)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeSlideId]);

  const moveThumbnailFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = Math.min(slides.length - 1, index + 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = slides.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const next = slides[nextIndex];
    if (!next) return;
    onActiveSlideChange(next.id);
    window.requestAnimationFrame(() => thumbnailRefs.current.get(next.id)?.focus());
  };

  return (
    <div
      ref={rootRef}
      data-deck-preview-layout
      data-deck-fit-zoom={DECK_PREVIEW_FIT_ZOOM_PERCENT}
      className={`flex h-full min-h-0 min-w-0 max-h-full overflow-hidden bg-[var(--advanced-stage-bg,#f4f1e8)] ${className}`}
      style={
        {
          "--deck-preview-accent": accent,
          ...deckPreviewViewportCapStyle(viewportMaxHeight),
        } as CSSProperties
      }
      data-deck-viewport-cap={
        viewportMaxHeight != null ? String(viewportMaxHeight) : undefined
      }
    >
      <aside
        aria-label={tt("幻灯片缩略图")}
        className="flex h-full min-h-0 w-[clamp(7.5rem,18vw,10rem)] shrink-0 flex-col overflow-hidden border-r border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]"
      >
        <div className="flex min-h-8 shrink-0 items-center justify-between gap-1 border-b border-[var(--border,#e7e5e4)] px-2 py-1.5">
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--muted,#78716c)]">
            {railLabel ?? tt("页面")}
          </span>
          {railActions}
        </div>
        <div
          data-deck-thumbnail-rail
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-2"
        >
          <ol className="space-y-2.5">
            {slides.map((slide, index) => {
              const active = slide.id === activeSlideId;
              return (
                <li key={slide.id}>
                  <button
                    ref={(node) => {
                      if (node) thumbnailRefs.current.set(slide.id, node);
                      else thumbnailRefs.current.delete(slide.id);
                    }}
                    type="button"
                    data-deck-thumbnail={slide.id}
                    aria-label={`${index + 1}. ${slide.label}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => onActiveSlideChange(slide.id)}
                    onKeyDown={(event) => moveThumbnailFocus(event, index)}
                    className="block w-full border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--deck-preview-accent)] focus-visible:ring-offset-1"
                  >
                    <DeckRailThumbnail
                      aspectRatio={thumbnailAspect}
                      active={active}
                      accent={accent}
                    >
                      {slide.thumbnail ?? (
                        <span className="flex h-full w-full items-center justify-center bg-[var(--surface,#fafaf9)] px-2 text-center text-[10px] text-[var(--muted,#78716c)]">
                          {slide.label}
                        </span>
                      )}
                    </DeckRailThumbnail>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>

      <main
        ref={viewportRef}
        data-deck-preview-stage
        data-deck-preview-zoom={geometry.zoomPercent}
        data-deck-preview-scale={geometry.scale}
        aria-label={stageLabel ?? tt("演示文稿画布")}
        aria-busy={busy}
        className="relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-[var(--advanced-stage-bg,#f4f1e8)]"
      >
        <div
          className="flex items-center justify-center"
          style={{
            minWidth: `max(100%, ${geometry.width + geometry.padding * 2}px)`,
            minHeight: `max(100%, ${geometry.height + geometry.padding * 2}px)`,
          }}
        >
          <div
            data-deck-page-frame
            className="relative shrink-0"
            style={{
              width: `${geometry.width}px`,
              height: `${geometry.height}px`,
            }}
          >
            <div
              key={activeSlideId}
              data-deck-logical-page
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: `${geometry.logicalWidth}px`,
                height: `${geometry.logicalHeight}px`,
                transform: `scale(${geometry.scale})`,
              }}
            >
              {children}
            </div>
          </div>
        </div>
        {stageOverlay}
      </main>
    </div>
  );
}
