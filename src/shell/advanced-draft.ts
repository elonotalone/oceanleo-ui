import type { AdvancedEditRevision } from "./advanced-persistence-controller";
import type { LibraryItem } from "./library-data";

export const ADVANCED_DRAFT_META_KEY = "advanced_server_draft";
export const ADVANCED_DRAFT_MAX_BYTES = 20_000_000;
export interface AdvancedDraftPointer {
  rootId: string;
  baseRevisionId: string;
  url: string;
  schema: string;
  editRevision: AdvancedEditRevision;
  savedAt: string;
}
export interface AdvancedDraftIdentity { rootId: string; baseRevisionId: string }
export interface AdvancedDraftVersionCoverage {
  schema: string;
  /** A reopened editor has its own mutation counter; clear only this exact
   * restored receipt, never a later upload from another edit/device. */
  restored?: AdvancedDraftPointer;
}
export function advancedDraftIdentity(item: LibraryItem): AdvancedDraftIdentity {
  return {
    rootId: String(item.meta.root_asset_id || item.meta.parent_asset_id || item.id || item.key).trim().slice(0, 512),
    baseRevisionId: String(item.revisionId || item.meta.revision_id || item.id),
  };
}
export function normalizeAdvancedDraftPointer(
  raw: unknown, identity?: AdvancedDraftIdentity, schema?: string,
): AdvancedDraftPointer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as AdvancedDraftPointer;
  if (![p.rootId, p.baseRevisionId, p.schema].every(v => typeof v === "string" && v.length > 0 && v.length <= 512) ||
    !(typeof p.editRevision === "number" && Number.isFinite(p.editRevision) || typeof p.editRevision === "string" && p.editRevision.length > 0 && p.editRevision.length <= 512) ||
    typeof p.savedAt !== "string" || !Number.isFinite(Date.parse(p.savedAt)) ||
    typeof p.url !== "string" || p.url.length > 8192) return null;
  try { const url = new URL(p.url); if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null; } catch { return null; }
  if (identity && (p.rootId !== identity.rootId || p.baseRevisionId !== identity.baseRevisionId) || schema && p.schema !== schema) return null;
  return { rootId: p.rootId, baseRevisionId: p.baseRevisionId, url: p.url, schema: p.schema, editRevision: p.editRevision, savedAt: p.savedAt };
}
export async function loadAdvancedDraft(
  pointer: AdvancedDraftPointer, signal?: AbortSignal,
  read?: typeof fetch,
): Promise<unknown> {
  const readDraft = read ?? (await import("./advanced-draft-transport")).readPrivateWorkingDraft;
  const response = await readDraft(pointer.url, { signal, cache: "no-store", credentials: "omit", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("服务器草稿暂时无法读取，请重新载入");
  const text = await response.text();
  if (!text || new TextEncoder().encode(text).byteLength > ADVANCED_DRAFT_MAX_BYTES) throw new Error("服务器草稿为空或过大");
  const envelope = JSON.parse(text);
  if (envelope?.schema !== pointer.schema || envelope?.rootId !== pointer.rootId ||
    !Object.is(envelope?.editRevision, pointer.editRevision) || envelope?.version !== 1 || envelope.data == null) {
    throw new Error("服务器草稿与当前素材不匹配");
  }
  return envelope.data;
}
