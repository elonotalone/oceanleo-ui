"use client";

// PPT 的回放画法（work-chat W13，契约 §8.4）。
// 只用 React 画只读缩略：用现有的 DeckSlideThumbnail 画当前页，变化的元素用作者的颜色描边。
// 不执行任何用户 HTML/JS，不用 iframe，不用 dangerouslySetInnerHTML。
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";
import { noteText } from "./notes";
import { DeckSlideThumbnail } from "../../../doc-editors/DeckSlideThumbnail";
import { DECK_PREVIEW_LOGICAL_WIDTH } from "../../../doc-editors/deck-preview-geometry";
import { deckMasterFor, deckTheme, type DeckDocument } from "../../../doc-editors/deck-schema";
import {
  deckChangedElements,
  deckChangeNote,
  deckFocusSlideIndex,
  deckFromRevision,
  deckFromY,
  deckToArtifactJson,
} from "../../../collab/adapters/deck";

function DeckFrame({ snapshot, prev, width, height, authorColor }: ReplayFrameProps) {
  const deck = snapshot as DeckDocument | null;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    return <div style={{ width, height }} />;
  }
  const before = prev && Array.isArray((prev as DeckDocument).slides) ? (prev as DeckDocument) : null;
  const index = deckFocusSlideIndex(before, deck);
  const slide = deck.slides[index];
  const ratio = deck.aspect === "4:3" ? 4 / 3 : 16 / 9;
  const thumbWidth = Math.max(1, Math.min(width, height * ratio));
  const thumbHeight = thumbWidth / ratio;
  const changed = before ? deckChangedElements(before, deck).get(slide.id) : undefined;
  const color = authorColor || "#6d5dfc";
  return (
    <div style={{ width, height, display: "grid", placeItems: "center" }}>
      <div style={{ position: "relative", width: thumbWidth, height: thumbHeight }} data-replay-deck-frame={index + 1}>
        <DeckSlideThumbnail
          slide={slide}
          number={index + 1}
          theme={deckTheme(deck.theme)}
          master={deckMasterFor(deck, slide)}
          pageWidth={DECK_PREVIEW_LOGICAL_WIDTH}
          pageHeight={DECK_PREVIEW_LOGICAL_WIDTH / ratio}
          thumbWidth={thumbWidth}
        />
        {changed
          ? slide.elements
              .filter((element) => changed.has(element.id))
              .map((element) => (
                <span
                  key={element.id}
                  data-replay-changed={element.id}
                  style={{
                    position: "absolute",
                    left: `${element.x}%`,
                    top: `${element.y}%`,
                    width: `${element.width}%`,
                    height: `${element.height}%`,
                    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                    outline: `2px solid ${color}`,
                    outlineOffset: 1,
                    pointerEvents: "none",
                    boxSizing: "border-box",
                  }}
                />
              ))
          : null}
      </div>
    </div>
  );
}

const renderer: ReplayFrameRenderer | null = {
  kind: "deck",
  fromY: (doc) => deckFromY(doc),
  fromRevision: (json) => deckFromRevision(json),
  Frame: DeckFrame,
  describeChange: (prev, next, tt) => noteText(tt, deckChangeNote(prev, next)),
  toArtifactJson: deckToArtifactJson,
};

export default renderer;
