import { ADVANCED_DRAFT_META_KEY, advancedDraftIdentity, loadAdvancedDraft, normalizeAdvancedDraftPointer } from "./advanced-draft";
import { PPTIST_CARRIER_FORMAT, pptistToDeckDocument } from "./doc-editors/deck-pptist-carrier";
import { normalizeDeckDocument, type DeckDocument } from "./doc-editors/deck-schema";
import { validateDeckIr } from "./doc-editors/deck-ir";
import type { DeckDraftState } from "./doc-editors/use-deck-editor";
import type { LibraryItem } from "./library-data";

export const DECK_DRAFT_SCHEMA = "oceanleo.deck-working-document.v1";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function slidesOf(value: unknown): unknown[] | null {
  const record = asRecord(value);
  return record && Array.isArray(record.slides) ? record.slides : null;
}

/** One working document, whichever face wrote it: envelope, PPTist JSON, or deck IR. */
export function deckDocumentFromWorkingDraft(value: unknown, title: string): DeckDocument | null {
  const record = asRecord(value);
  if (!record) return null;
  const nested = record.deck;
  if (nested && slidesOf(nested)?.length) {
    const deck = normalizeDeckDocument(nested, title);
    return deck.slides.length ? deck : null;
  }
  const format = String(record.format || "");
  if (
    (format === PPTIST_CARRIER_FORMAT || format === "pptist") &&
    slidesOf(record)
  ) {
    const deck = normalizeDeckDocument(pptistToDeckDocument(record, title), title);
    return deck.slides.length ? deck : null;
  }
  if (slidesOf(record)) {
    const deck = normalizeDeckDocument(record, title);
    return deck.slides.length ? deck : null;
  }
  return null;
}

function draftFromWorkingPayload(value: unknown): DeckDraftState | null {
  const record = asRecord(value);
  const draft = record?.draft as DeckDraftState | null | undefined;
  return draft || null;
}

/** Also used when reopening a session on another device; never falls back to
 * an older version after a matching server draft failed to load. */
export async function loadDeckServerDraft(item: LibraryItem, signal?: AbortSignal, read: typeof fetch = fetch) {
  const pointer = normalizeAdvancedDraftPointer(item.meta[ADVANCED_DRAFT_META_KEY], advancedDraftIdentity(item), DECK_DRAFT_SCHEMA);
  if (!pointer) return null;
  const raw = await loadAdvancedDraft(pointer, signal, read);
  const deck = deckDocumentFromWorkingDraft(raw, item.title || "演示文稿");
  if (!deck) throw new Error("服务器草稿不是有效的演示文稿");
  const draft = draftFromWorkingPayload(raw);
  if (draft && (!validateDeckIr(draft.project).ok || !draft.assetUrls || typeof draft.assetUrls !== "object")) {
    throw new Error("服务器草稿缺少演示文稿工程资源");
  }
  return { deck, draft, serverDraft: pointer };
}
