/** LeoBay 成品目录：官方模板与卖家作品按真实文件类型合并，仅兼容旧的一级 PPT。 */
import { resolveBayAsset } from "../../../lib/bay/assets";
import { bayAssetToLibraryEntry } from "../asset/library-entry-adapter";
import { fetchBayFeed } from "../../../lib/bay/feed";
import { resolveAssetDetail } from "../../asset-detail/resolve";
import type { ResolvedAssetDetail } from "../../asset-detail/types";
import type { ArtifactContextRef } from "../../artifact-contract";
import { BAY_ASSET_TYPE_ORDER, searchBayLibrary, type BayAsset, type BayAssetType } from "../asset/library-client";
import { listBayOfficialTemplates } from "../asset/bay-template-shelf";

export type ReadyFile = BayAsset & { entry?: ResolvedAssetDetail["entry"] };

const ARTIFACT_KIND: Readonly<Record<string, BayAssetType>> = {
  document: "document", single_file_image: "image", composite_image: "poster", deck: "ppt",
  vector_image: "vector", model_3d: "3d", grid: "grid", pdf: "pdf", audio: "audio", website: "website", game: "game",
};
const LIBRARY_KIND: Readonly<Record<string, BayAssetType>> = {
  document: "document", image: "image", ppt: "ppt", sheet: "grid", threed: "3d", audio: "audio", website: "website", game: "game",
};

/** Prefer the canonical artifact type. Unknown/unsupported files never acquire a guessed category. */
export function readyTypeForEntry(entry: ResolvedAssetDetail["entry"]): BayAssetType | null {
  const item = entry.libraryItem;
  const artifactType = item?.artifactType || item?.artifact?.artifactType;
  if (artifactType) return ARTIFACT_KIND[artifactType] || null;
  return LIBRARY_KIND[item?.kind || entry.kind || ""] || null;
}

export function readyTypeFromSearch(search: string): BayAssetType | null {
  const type = new URLSearchParams(search).get("type") || "";
  return BAY_ASSET_TYPE_ORDER.find((item) => item === type) || null;
}

export function readyShelfCover(items: readonly ReadyFile[]): string {
  return items.find((item) => item.thumb_url || item.preview_url)?.thumb_url ||
    items.find((item) => item.thumb_url || item.preview_url)?.preview_url || "";
}

export async function loadReadyOfficial(type: BayAssetType, scope: { siteKey: string; context?: ArtifactContextRef; signal: AbortSignal }): Promise<ReadyFile[]> {
  const result = await listBayOfficialTemplates({ type, siteKey: scope.siteKey, context: scope.context, signal: scope.signal });
  scope.signal.throwIfAborted();
  return result.items;
}

/** The old type=ppt assets are finished decks, unlike the old image/vector/stock shelves. */
export async function loadReadyLegacyPpt(signal: AbortSignal): Promise<ReadyFile[]> {
  const items = new Map<string, ReadyFile>();
  for (let page = 1; ; page += 1) {
    signal.throwIfAborted();
    const result = await searchBayLibrary({ type: "ppt", origin: "first-party", page, pageSize: 60 });
    signal.throwIfAborted();
    const before = items.size;
    for (const item of result.items) {
      if (item.type === "ppt" && item.origin === "first-party") items.set(item.id, item);
    }
    if (!result.has_more) break;
    if (items.size === before) throw new Error("素材没读出来，请稍后再试。");
  }
  return [...items.values()];
}

/** The public feed omits artifact type; the existing read-only resolver supplies it. */
export async function loadReadySellers(signal: AbortSignal): Promise<ReadyFile[]> {
  const listings = new Map<string, Awaited<ReturnType<typeof fetchBayFeed>>["items"][number]>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await fetchBayFeed({ kind: "supply", listing_kind: "digital", limit: 40 }, cursor, { signal });
    signal.throwIfAborted();
    for (const item of page.items) listings.set(item.id, item);
    cursor = page.next_cursor;
    if (cursor && cursors.has(cursor)) throw new Error("素材没读出来，请稍后再试。");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const queue = [...listings.values()];
  const assets: ReadyFile[] = [];
  let failed = false;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (next < queue.length) {
      const listing = queue[next++]!;
      try {
        const ref = { kind: "listing" as const, id: listing.id };
        const resolved = await resolveBayAsset(ref, { signal });
        signal.throwIfAborted();
        const rawType = resolved.asset?.type || resolved.facts?.kind;
        const detail = resolved.asset
          ? { entry: bayAssetToLibraryEntry({ ...resolved.asset, action_context: resolved.actionContext }), actionContext: resolved.actionContext }
          : await resolveAssetDetail(ref, { signal, surface: "bay" });
        signal.throwIfAborted();
        const type = rawType ? ARTIFACT_KIND[rawType] || LIBRARY_KIND[rawType] || BAY_ASSET_TYPE_ORDER.find((type) => type === rawType) || null : readyTypeForEntry(detail.entry);
        if (!type) continue;
        const item = detail.entry.libraryItem;
        assets.push({
          id: `listing:${listing.id}`, source: "seller", type, title: listing.title,
          thumb_url: listing.cover_url || item?.thumbUrl || item?.posterUrl || "",
          preview_url: item?.previewUrl || "", full_url: "", width: null, height: null, duration: null,
          author: listing.author.display_name || listing.author.handle || "", source_url: "",
          category: listing.category || undefined, tags: detail.entry.keywords,
          action_context: detail.actionContext, entry: detail.entry,
          license: { code: detail.actionContext.license?.code || "", name: "", url: detail.actionContext.license?.url || "",
            commercial_ok: detail.actionContext.license?.commercialOk === true, modify_ok: detail.actionContext.license?.modifyOk === true,
            attribution_required: Boolean(detail.actionContext.license?.attribution), attribution_text: detail.actionContext.license?.attribution || "" },
        });
      } catch {
        signal.throwIfAborted();
        failed = true;
      }
    }
  }));
  const order = new Map(queue.map((listing, index) => [`listing:${listing.id}`, index]));
  assets.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  // Keep successfully classified works visible and expose partial failures to the page.
  if (failed) throw Object.assign(new Error("素材没读出来，请稍后再试。"), { items: assets });
  return assets;
}
