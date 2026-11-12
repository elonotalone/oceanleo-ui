"use client";

import {
  Component,
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { DECK_PREVIEW_LOGICAL_WIDTH } from "./deck-preview-geometry";
import {
  createDeckMaster,
  deckTheme,
  type DeckElement,
  type DeckMaster,
  type DeckSlide,
  type DeckTheme,
} from "./deck-schema";
import {
  DeckElementContent,
  deckShapeClipPath,
} from "./DeckElementContent";
import { DeckMiniSlide } from "./DeckMiniSlide";

export const deckSlidePaintRenderCounts = new Map<string, number>();

export function resetDeckSlidePaintRenderCounts(): void {
  deckSlidePaintRenderCounts.clear();
}

export function hashDeckSlideContent(slide: DeckSlide): string {
  return JSON.stringify({
    id: slide.id,
    title: slide.title,
    body: slide.body,
    bullets: slide.bullets,
    layout: slide.layout,
    background: slide.background,
    masterId: slide.masterId,
    image: slide.image,
    elements: slide.elements,
  });
}

function notePaint(slideId: string): void {
  deckSlidePaintRenderCounts.set(
    slideId,
    (deckSlidePaintRenderCounts.get(slideId) || 0) + 1,
  );
}

function deckElementFrameStyle(element: DeckElement): CSSProperties {
  const shapeClip =
    element.type === "shape" ? deckShapeClipPath(element.shape) : undefined;
  return {
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    transform: `rotate(${element.rotation}deg)`,
    zIndex: Math.round(element.order),
    opacity: element.opacity ?? 1,
    background:
      element.type === "shape" && element.shape !== "line"
        ? element.fill || "transparent"
        : undefined,
    border:
      (element.type === "shape" || element.type === "image") &&
      element.borderWidth
        ? `${element.borderWidth}px solid ${element.borderColor || "#000"}`
        : undefined,
    borderRadius:
      element.type === "shape" && element.shape === "circle"
        ? "50%"
        : `${element.borderRadius || 0}px`,
    boxShadow: element.shadow ? "0 14px 32px rgba(15,23,42,.24)" : undefined,
    clipPath: shapeClip,
    pointerEvents: "none",
  };
}

function DeckSlidePaintView({
  slide,
  theme,
  master,
  pageWidth,
  pageHeight,
}: {
  slide: DeckSlide;
  theme: DeckTheme;
  master: DeckMaster;
  pageWidth: number;
  pageHeight: number;
}) {
  notePaint(slide.id);
  const background = slide.background || master.background || theme.background;

  return (
    <div
      data-deck-slide-paint="elements"
      className="relative overflow-hidden"
      style={{
        width: pageWidth,
        height: pageHeight,
        background,
        color: master.textColor || theme.text,
        fontFamily: master.fontFamily || theme.fontFamily,
        containerType: "inline-size",
        pointerEvents: "none",
      }}
    >
      {slide.elements.length > 0 ? (
        [...slide.elements]
          .sort((left, right) => left.order - right.order)
          .map((element) => (
            <div
              key={element.id}
              data-deck-element={element.id}
              data-element-type={element.type}
              className="absolute overflow-hidden"
              style={deckElementFrameStyle(element)}
            >
              <div className="h-full w-full overflow-hidden rounded-[inherit]">
                <DeckElementContent
                  element={element}
                  aspect={pageWidth / pageHeight < 1.5 ? "4:3" : "16:9"}
                />
              </div>
            </div>
          ))
      ) : (
        null
      )}
    </div>
  );
}

const DeckSlidePaint = memo(DeckSlidePaintView, (prev, next) => {
  return (
    hashDeckSlideContent(prev.slide) === hashDeckSlideContent(next.slide) &&
    prev.pageWidth === next.pageWidth &&
    prev.pageHeight === next.pageHeight &&
    prev.theme.background === next.theme.background &&
    prev.theme.text === next.theme.text &&
    prev.theme.fontFamily === next.theme.fontFamily &&
    prev.master.background === next.master.background &&
    prev.master.textColor === next.master.textColor &&
    prev.master.fontFamily === next.master.fontFamily
  );
});

class DeckSlideThumbnailBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function DeckSlideThumbnail({
  slide,
  number = 1,
  theme,
  master,
  pageWidth = DECK_PREVIEW_LOGICAL_WIDTH,
  pageHeight,
  thumbWidth,
}: {
  slide: DeckSlide;
  number?: number;
  theme?: DeckTheme;
  master?: DeckMaster;
  pageWidth?: number;
  pageHeight?: number;
  thumbWidth?: number;
}) {
  const resolvedTheme = theme ?? deckTheme("ocean");
  const resolvedMaster = master ?? createDeckMaster(resolvedTheme.id);
  const resolvedHeight =
    Number.isFinite(pageHeight) && (pageHeight as number) > 0
      ? (pageHeight as number)
      : pageWidth / (16 / 9);
  const explicitThumb =
    Number.isFinite(thumbWidth) && (thumbWidth as number) > 0
      ? (thumbWidth as number)
      : null;
  const hostRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const hash = hashDeckSlideContent(slide);

  useLayoutEffect(() => {
    if (explicitThumb) return;
    const node = hostRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      if (width > 0) setMeasuredWidth(width);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [explicitThumb]);

  const boxWidth = explicitThumb ?? (measuredWidth > 0 ? measuredWidth : 0);
  const scale = boxWidth > 0 && pageWidth > 0 ? boxWidth / pageWidth : 0;
  const displayScale = scale > 0 ? scale : 1;

  return (
    <div
      ref={hostRef}
      data-deck-slide-thumbnail
      data-deck-slide-hash={hash}
      data-deck-slide-scale={scale > 0 ? String(scale) : ""}
      className="relative h-full w-full overflow-hidden"
      style={
        explicitThumb
          ? {
              width: explicitThumb,
              height: (resolvedHeight / pageWidth) * explicitThumb,
            }
          : { width: "100%", height: "100%" }
      }
    >
      <DeckSlideThumbnailBoundary
        fallback={
          <DeckMiniSlide
            slide={slide}
            number={number}
            active={false}
            theme={resolvedTheme}
            master={resolvedMaster}
            aspectRatio={pageWidth / resolvedHeight}
          />
        }
      >
        <div
          data-deck-slide-scaled
          aria-hidden="true"
          className="pointer-events-none origin-top-left"
          style={{
            width: pageWidth,
            height: resolvedHeight,
            transform: `scale(${displayScale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          <DeckSlidePaint
            slide={slide}
            theme={resolvedTheme}
            master={resolvedMaster}
            pageWidth={pageWidth}
            pageHeight={resolvedHeight}
          />
        </div>
      </DeckSlideThumbnailBoundary>
    </div>
  );
}
