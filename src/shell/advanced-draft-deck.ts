import { ADVANCED_DRAFT_META_KEY, advancedDraftIdentity, loadAdvancedDraft, normalizeAdvancedDraftPointer } from "./advanced-draft";
import { normalizeDeckDocument, type DeckDocument } from "./doc-editors/deck-schema";
import type { LibraryItem } from "./library-data";

export const DECK_DRAFT_SCHEMA = "oceanleo.deck-working-document.v1";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Recovery drafts contain only the PPTX editor's freely positioned elements. */
export function deckDocumentFromWorkingDraft(value: unknown, title: string): DeckDocument | null {
  const outer = asRecord(value);
  const document = asRecord(outer?.deck) || outer;
  if (!document || document.version !== 2 || !Array.isArray(document.slides) || !document.slides.length) return null;
  if (!document.slides.every((slide) => Array.isArray(asRecord(slide)?.elements))) return null;
  return normalizeDeckDocument(document, title);
}

/** Also used when reopening a session on another device; never falls back to
 * an older version after a matching server draft failed to load. */
export async function loadDeckServerDraft(item: LibraryItem, signal?: AbortSignal, read?: typeof fetch) {
  const pointer = normalizeAdvancedDraftPointer(item.meta[ADVANCED_DRAFT_META_KEY], advancedDraftIdentity(item), DECK_DRAFT_SCHEMA);
  if (!pointer) return null;
  const raw = await loadAdvancedDraft(pointer, signal, read);
  const deck = deckDocumentFromWorkingDraft(raw, item.title || "演示文稿");
  if (!deck) throw new Error("服务器草稿不是有效的演示文稿");
  return { deck, serverDraft: pointer };
}
