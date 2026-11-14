import { cloneDeckDocument, type DeckDocument } from "./deck-schema";
import { durableEditorMediaUrl } from "./editor-insert-media";

export const DECK_WORKING_COPY_SCHEMA = "oceanleo.deck-working-document.v1";

/** Preserve every editor field; normalising a working copy would lose exact state. */
export function deckDocumentFromWorkingCopy(payload: unknown): DeckDocument | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const doc = payload as DeckDocument;
  if (doc.version !== 2 || !Array.isArray(doc.slides) || !doc.slides.length ||
      !Array.isArray(doc.masters) || !doc.masters.length ||
      !doc.slides.every((slide) => slide && typeof slide.id === "string" && Array.isArray(slide.elements))) return null;
  return cloneDeckDocument(doc);
}

/** Imported PPTX pictures and drawn signatures are uploaded at insertion, never save. */
export async function prepareDeckMedia(deck: DeckDocument, siteId: string): Promise<DeckDocument> {
  const urls = new Map<string, Promise<string>>();
  const durable = (src: string) => {
    let next = urls.get(src);
    if (!next) {
      next = durableEditorMediaUrl(src, siteId);
      urls.set(src, next);
    }
    return next;
  };
  const next = cloneDeckDocument(deck);
  await Promise.all(next.slides.map(async (slide) => {
    if (slide.image?.url) slide.image.url = await durable(slide.image.url);
    await Promise.all(slide.elements.map(async (element) => {
      if (element.type === "image" && element.src) element.src = await durable(element.src);
    }));
  }));
  return next;
}
