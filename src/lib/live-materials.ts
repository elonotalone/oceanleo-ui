import { bayDelete, bayGet, bayPost } from "./bay/http";
import { normalizeArtifactProjection } from "../shell/artifact-contract";
import { artifactProjectionToLibraryItem, isDurableLibraryItem, type LibraryItem } from "../shell/library-data";

export const LIVE_MATERIAL_TYPES = ["image", "video", "3d", "texture", "hdri", "icon", "font"] as const;
export type LiveMaterialType = typeof LIVE_MATERIAL_TYPES[number];
export const LIVE_MATERIAL_LABELS: Record<LiveMaterialType, string> = {
  image: "图片", video: "视频", "3d": "3D 模型", texture: "材质贴图", hdri: "HDRI 环境", icon: "图标", font: "字体",
};
export interface LiveMaterial {
  id: string;
  provider: string;
  type: LiveMaterialType;
  title: string;
  author: string;
  source_url: string;
  thumb_url: string;
  preview_url: string;
  formats: string[];
  collection?: string;
  needs_connection?: "sketchfab";
  license: { code: string; url: string; attributionRequired: boolean; attributionText: string };
}
export interface LiveMaterialPage {
  items: LiveMaterial[];
  page: number;
  has_more: boolean;
  partial: boolean;
}

/** External media and links are data; never admit executable URL schemes. */
export function materialHttpUrl(value: string | undefined): string {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function liveTypesForEditor(kind: string, declared: readonly string[] = [], appId = ""): LiveMaterialType[] {
  if (["website", "game", "app"].includes(kind) || /website|workbench/.test(appId)) return [...LIVE_MATERIAL_TYPES];
  if (kind === "video" || declared.includes("video")) return ["video", "image"];
  if (["ppt", "deck", "document", "pdf", "sheet", "grid"].includes(kind)) return ["image", "icon"];
  if (["image", "canvas", "xhs"].includes(kind)) return ["image", "icon", "texture"];
  return declared.includes("image") ? ["image", "icon"] : [];
}

export async function searchLiveMaterials(params: {
  q?: string; type: LiveMaterialType; page?: number; pageSize?: number; signal?: AbortSignal;
}): Promise<LiveMaterialPage> {
  const query = new URLSearchParams({ q: params.q || "", type: params.type, license: "commercial",
    page: String(params.page || 1), page_size: String(params.pageSize || 24) });
  const result = await bayGet<{
    items?: (Omit<LiveMaterial, "provider" | "license" | "formats"> & {
      provider?: string; source?: string; formats?: string[];
      license?: Partial<LiveMaterial["license"]> & { attribution_required?: boolean; attribution_text?: string };
    })[]; has_more?: boolean; partial?: boolean;
  }>(`/v1/assets/search?${query}`, { anonymous: true, signal: params.signal });
  return { items: (result.items || []).map(item => ({ ...item,
    provider: item.provider || item.source || "", formats: item.formats || [],
    license: { code: item.license?.code || "", url: item.license?.url || "",
      attributionRequired: item.license?.attributionRequired ?? item.license?.attribution_required ?? false,
      attributionText: item.license?.attributionText ?? item.license?.attribution_text ?? "" },
  })), page: params.page || 1, has_more: Boolean(result.has_more), partial: Boolean(result.partial) };
}

function usableProjection(item: import("../shell/artifact-contract").ArtifactProjection): boolean {
  return Boolean(item.access.canRead && item.integrity.ok && item.provenance?.id && item.provenance.licenseCode);
}

function acquiredMaterial(item: LibraryItem): LibraryItem {
  if (typeof window !== "undefined") {
    if (item.meta.library_folder_id) {
      window.dispatchEvent(new window.CustomEvent("oceanleo:library-folders-change", { detail: { folder: item.meta.folder } }));
    } else {
      window.dispatchEvent(new window.CustomEvent("oceanleo:artifact-library-change", {
        detail: { action: "ensure", artifactId: item.artifactId, revisionId: item.revisionId, item },
      }));
    }
  }
  return item;
}

/** Only durable, readable typed copies can enter an editor's command/history path. */
export interface MaterialAcquisition {
  acquisitionId: string;
  materialId: string;
  state: "pending" | "done" | "failed";
  item?: unknown;
  error?: { code: string; message: string };
}
export function materialAcquisitionStatus(id: string, signal?: AbortSignal): Promise<MaterialAcquisition> {
  return bayGet(`/v1/assets/acquisitions/${encodeURIComponent(id)}`, { signal });
}
export async function recentMaterialAcquisitions(signal?: AbortSignal): Promise<MaterialAcquisition[]> {
  return (await bayGet<{ items: MaterialAcquisition[] }>("/v1/assets/acquisitions", { signal })).items;
}
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const done = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason); };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function useLiveMaterial(input: { id: string; variant?: string; title?: string }, options: {
  signal?: AbortSignal; onProgress?: (state: MaterialAcquisition) => void;
} = {}): Promise<LibraryItem> {
  let result = await bayPost<unknown>("/v1/assets/use", input);
  let attempt = 0;
  const deadline = Date.now() + 15 * 60 * 1000;
  while ((result as MaterialAcquisition)?.state === "pending") {
    const pending = result as MaterialAcquisition;
    if (!pending.acquisitionId) throw new Error("素材未能存入我的库，请重试");
    options.onProgress?.(pending);
    if (Date.now() >= deadline) throw new Error("素材未能存入我的库，请重试");
    await pause(Math.min(1000 * 1.5 ** attempt++, 10000), options.signal);
    try { result = await materialAcquisitionStatus(pending.acquisitionId, options.signal); }
    catch (error) {
      if (options.signal?.aborted || Date.now() >= deadline ||
          (error && typeof error === "object" && "status" in error && [401,403,404].includes(Number(error.status)))) throw error;
      // Temporary transport failures do not start another acquisition.
    }
  }
  const acquisition = result as MaterialAcquisition;
  if (acquisition?.state === "failed") {
    options.onProgress?.(acquisition);
    throw Object.assign(new Error(acquisition.error?.message || "素材未能存入我的库，请重试"), { code: acquisition.error?.code });
  }
  if (acquisition?.state === "done") { options.onProgress?.(acquisition); result = acquisition.item; }
  if (options.signal?.aborted) throw options.signal.reason;
  return normalizeAcquiredMaterial(result);
}

function normalizeAcquiredMaterial(result: unknown): LibraryItem {
  const folderResult = result as { kind?: string; folderId?: string; title?: string; visibility?: string;
    folder?: { id?: string }; provenance?: Record<string, unknown> } | null;
  if (folderResult?.kind === "folder" && folderResult.folderId && folderResult.folder?.id === folderResult.folderId &&
      folderResult.visibility === "private" && (folderResult.provenance?.licenseCode || folderResult.provenance?.license_code)) {
    // Existing Library file/folder identity, never fabricate an artifact revision.
    return acquiredMaterial({ key: `folder:${folderResult.folderId}`, id: folderResult.folderId, source: "artifact", kind: "file",
      title: folderResult.title || "", siteId: "", favorite: false,
      meta: { library_folder_id: folderResult.folderId, folder: folderResult.folder, provenance: folderResult.provenance } });
  }
  const candidate = result as LibraryItem;
  if (candidate && isDurableLibraryItem(candidate) && usableProjection(candidate.artifact)) return acquiredMaterial(candidate);
  const projection = normalizeArtifactProjection(result);
  if (!projection || !usableProjection(projection)) throw new Error("素材未能存入我的库，请重试");
  return acquiredMaterial(artifactProjectionToLibraryItem(projection));
}

export interface MaterialConnection { provider: string; status: "unconfigured" | "disconnected" | "connected" }
export async function materialConnections(signal?: AbortSignal): Promise<MaterialConnection[]> {
  const result = await bayGet<{ connections: MaterialConnection[] }>("/v1/assets/connections", { signal });
  return result.connections;
}
export async function startSketchfabConnection(): Promise<string> {
  const { url } = await bayPost<{ url: string }>("/v1/assets/connections/sketchfab/start");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["sketchfab.com", "www.sketchfab.com"].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error("连接未完成，请重试");
  }
  return parsed.href;
}
export function disconnectSketchfab(): Promise<unknown> {
  return bayDelete("/v1/assets/connections/sketchfab");
}
