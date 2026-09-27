import type { AppSession } from "../lib/app-session";
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
export function advancedDraftCovers(covered: AdvancedEditRevision | undefined, revision: AdvancedEditRevision): boolean {
  return covered !== undefined && (Object.is(covered, revision) || typeof covered === "number" && typeof revision === "number" && covered >= revision);
}
/** A newer full working document remains valid on the just-published base. */
export function advancedDraftAfterVersion(
  draft: AdvancedDraftPointer | null, covered: AdvancedEditRevision | undefined, baseRevisionId: string,
): AdvancedDraftPointer | null {
  if (!draft || covered === undefined || advancedDraftCovers(covered, draft.editRevision)) return null;
  return { ...draft, baseRevisionId };
}

/** Shared by draft and version CAS; receipts remain authoritative before React rerenders. */
export class AdvancedDraftSnapshotQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private receipt: AppSession | null = null;
  run<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
  current(observed: AppSession | null): AppSession | null {
    if (!observed || observed.id !== this.receipt?.id) return observed;
    return this.receipt.revision > observed.revision ? this.receipt : observed;
  }
  accept(session: AppSession | undefined): void { if (session) this.receipt = session; }
}

export async function uploadAdvancedDraft(input: {
  identity: AdvancedDraftIdentity; schema: string; revision: AdvancedEditRevision;
  payload: unknown; siteId: string; title: string;
}, dependencies?: { upload: typeof import("../lib/database").uploadFile; now?: () => string }): Promise<AdvancedDraftPointer> {
  if (input.payload == null) throw new Error("编辑器尚未提供可保存的工作文档");
  const savedAt = dependencies?.now?.() ?? new Date().toISOString();
  const encoded = JSON.stringify({ ...input.identity, schema: input.schema, version: 1, editRevision: input.revision, savedAt, data: input.payload });
  const file = new File([encoded], "working-document.oceanleo-project.json", { type: "application/json" });
  if (file.size > ADVANCED_DRAFT_MAX_BYTES) throw new Error("工作文档超过 20MB 安全上限");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join("");
  const upload = dependencies?.upload ?? (await import("../lib/database")).uploadFile;
  const uploaded = await upload(file, { siteId: input.siteId, title: `${input.title}草稿`, registerAsset: false,
    idempotencyKey: `advanced-draft:${digest}` });
  const pointer = normalizeAdvancedDraftPointer({ ...input.identity, schema: input.schema, editRevision: input.revision,
    savedAt, url: uploaded.data?.file?.url });
  if (!uploaded.ok || !pointer) throw new Error(uploaded.error || "存储服务没有确认草稿地址");
  return pointer;
}

export async function loadAdvancedDraft(
  pointer: AdvancedDraftPointer, signal?: AbortSignal,
  read: typeof fetch = fetch,
): Promise<unknown> {
  const response = await read(pointer.url, { signal, cache: "no-store", credentials: "omit", headers: { Accept: "application/json" } });
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
