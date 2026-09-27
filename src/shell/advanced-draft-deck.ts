import { ADVANCED_DRAFT_META_KEY, advancedDraftIdentity, loadAdvancedDraft, normalizeAdvancedDraftPointer } from "./advanced-draft";
import { normalizeDeckDocument } from "./doc-editors/deck-schema";
import { validateDeckIr } from "./doc-editors/deck-ir";
import type { DeckDraftState } from "./doc-editors/use-deck-editor";
import type { LibraryItem } from "./library-data";

export const DECK_DRAFT_SCHEMA = "oceanleo.deck-working-document.v1";

/** Also used when reopening a session on another device; never falls back to
 * an older version after a matching server draft failed to load. */
export async function loadDeckServerDraft(item: LibraryItem, signal?: AbortSignal, read: typeof fetch = fetch) {
  const pointer = normalizeAdvancedDraftPointer(item.meta[ADVANCED_DRAFT_META_KEY], advancedDraftIdentity(item), DECK_DRAFT_SCHEMA);
  if (!pointer) return null;
  const raw = await loadAdvancedDraft(pointer, signal, read) as { deck?: { slides?: unknown[] }; draft?: DeckDraftState | null };
  if (!raw?.deck || !Array.isArray(raw.deck.slides) || !raw.deck.slides.length) throw new Error("服务器草稿不是有效的演示文稿");
  if (raw.draft && (!validateDeckIr(raw.draft.project).ok || !raw.draft.assetUrls || typeof raw.draft.assetUrls !== "object")) {
    throw new Error("服务器草稿缺少演示文稿工程资源");
  }
  return { deck: normalizeDeckDocument(raw.deck, item.title), draft: raw.draft || null, serverDraft: pointer };
}
