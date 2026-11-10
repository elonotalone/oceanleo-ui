"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { accessToken } from "../lib/auth/client";
import { gatewayBase } from "../lib/auth/config";
import type { LibraryItem, LibraryKind } from "./library-data";
import { linkWorkLibraryItem, normalizeLinkWork } from "./works/link-work-item";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

export interface ProjectScopeAsset {
  id: string;
  project_id?: string;
  parent_id?: string | null;
  kind: "file" | "folder";
  name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  path?: string;
}

export interface ProjectScopeReference {
  kind: "artifact" | "work";
  id: string;
  item?: Record<string, unknown> | null;
}

export interface ProjectScopeResult {
  items: LibraryItem[];
  references: ProjectScopeReference[];
  assets: ProjectScopeAsset[];
  canEdit: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function projectPath(projectId: string, suffix: string): string {
  return `/v1/projects/${encodeURIComponent(projectId)}${suffix}`;
}
function projectUrl(projectId: string, suffix: string): string {
  return `${gatewayBase()}${projectPath(projectId, suffix)}`;
}

async function projectRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${gatewayBase()}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`project scope request failed (${response.status})`);
  return (await response.json()) as T;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

function libraryKindForMime(mime: string): LibraryKind {
  const value = mime.toLowerCase();
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("audio/")) return "audio";
  if (value.includes("pdf")) return "document";
  if (value.includes("spreadsheet") || value.includes("csv") || value.includes("excel")) return "sheet";
  if (value.includes("presentation") || value.includes("powerpoint")) return "ppt";
  if (value.includes("html")) return "website";
  if (value.startsWith("text/") || value.includes("markdown") || value.includes("json") || value.includes("javascript") || value.includes("typescript")) return "document";
  return "file";
}

function referenceLibraryItem(reference: ProjectScopeReference): LibraryItem | null {
  const raw = record(reference.item);
  if (!raw) return null;
  if (reference.kind === "work") {
    const work = record(raw.link_work);
    if (work) {
      const normalizedWork = normalizeLinkWork({ ...work, id: text(work.id) || reference.id, title: text(work.title) || text(raw.title) || "Untitled work" });
      if (!normalizedWork) return null;
      const normalized = linkWorkLibraryItem(normalizedWork);
      return { ...normalized, meta: { ...normalized.meta, project_scope: true, project_reference: true, project_reference_kind: reference.kind } };
    }
  }
  const title = text(raw.title) || "Untitled artifact";
  const kind = text(raw.kind);
  const item: LibraryItem = {
    key: `project-${reference.kind}:${reference.id}`,
    source: "artifact",
    id: reference.id,
    artifactId: reference.kind === "artifact" ? reference.id : undefined,
    title,
    kind: (["website", "canvas", "ppt", "sheet", "document", "image", "video", "audio", "file"] as string[]).includes(kind) ? kind as LibraryKind : "file",
    siteId: "",
    favorite: false,
    meta: { library_source_label: "项目素材", project_reference: true, project_reference_kind: reference.kind },
  };
  return item;
}

function assetLibraryItem(asset: ProjectScopeAsset, projectId: string, path: string): LibraryItem {
  const mime = text(asset.mime_type);
  const fileUrl = projectUrl(projectId, `/assets/${encodeURIComponent(asset.id)}/file`);
  return {
    key: `project-asset:${asset.id}`,
    source: "artifact",
    id: asset.id,
    title: asset.name,
    kind: libraryKindForMime(mime),
    siteId: "",
    favorite: false,
    createdAt: asset.created_at || asset.updated_at || undefined,
    url: fileUrl,
    meta: {
      library_source_label: "项目文件",
      project_scope: true,
      project_asset: true,
      project_asset_id: asset.id,
      project_id: projectId,
      filename: asset.name,
      mime_type: mime,
      source_bytes: asset.size_bytes || 0,
      folder_path: path,
      open_url: fileUrl,
      download_url: projectUrl(projectId, `/assets/${encodeURIComponent(asset.id)}/download`),
    },
  };
}

export function mapProjectScopePayload(
  references: readonly ProjectScopeReference[],
  assets: readonly ProjectScopeAsset[],
  projectId: string,
): LibraryItem[] {
  const items = references.flatMap((reference) => {
    const item = referenceLibraryItem(reference);
    return item ? [item] : [];
  });
  return [...items, ...assets.filter((asset) => asset.kind === "file").map((asset) => assetLibraryItem(asset, projectId, asset.path || ""))];
}

export async function loadProjectLibraryScope(projectId: string, signal?: AbortSignal): Promise<ProjectScopeResult> {
  if (!UUID.test(projectId)) throw new Error("invalid project id");
  const [referencePayload, rootPayload, accessPayload] = await Promise.all([
    projectRequest<{ items?: unknown }>(projectPath(projectId, "/library-items"), { signal }),
    projectRequest<{ items?: unknown }>(projectPath(projectId, "/assets?limit=200"), { signal }),
    projectRequest<{ role?: unknown }>(projectPath(projectId, "/access"), { signal }).catch(() => ({ role: "view" })),
  ]);
  const roots = Array.isArray(rootPayload.items) ? rootPayload.items : [];
  const assets: ProjectScopeAsset[] = roots.flatMap((entry) => {
    const raw = record(entry); if (!raw) return [];
    const kind = raw.kind === "folder" ? "folder" : raw.kind === "file" ? "file" : "";
    const id = text(raw.id); if (!kind || !id) return [];
    return [{ id, kind, name: text(raw.name) || id, parent_id: typeof raw.parent_id === "string" ? raw.parent_id : null, mime_type: text(raw.mime_type) || null, size_bytes: typeof raw.size_bytes === "number" ? raw.size_bytes : 0, created_at: text(raw.created_at) || null, updated_at: text(raw.updated_at) || null } as ProjectScopeAsset];
  });
  const pendingFolders = assets.filter((asset) => asset.kind === "folder").map((folder) => ({ folder, path: folder.name }));
  while (pendingFolders.length) {
    const current = pendingFolders.shift()!;
    const childPayload = await projectRequest<{ items?: unknown }>(projectPath(projectId, `/assets?parent_id=${encodeURIComponent(current.folder.id)}&limit=200`), { signal });
    const children = Array.isArray(childPayload.items) ? childPayload.items : [];
    for (const entry of children) {
      const raw = record(entry); if (!raw) continue;
      const kind = raw.kind === "folder" ? "folder" : raw.kind === "file" ? "file" : "";
      const id = text(raw.id); const name = text(raw.name) || id; if (!kind || !id) continue;
      const path = `${current.path}/${name}`;
      const child = { id, kind, name, parent_id: current.folder.id, mime_type: text(raw.mime_type) || null, size_bytes: typeof raw.size_bytes === "number" ? raw.size_bytes : 0, created_at: text(raw.created_at) || null, updated_at: text(raw.updated_at) || null, path } as ProjectScopeAsset;
      assets.push(child);
      if (kind === "folder") pendingFolders.push({ folder: child, path });
    }
  }
  const references = Array.isArray(referencePayload.items) ? referencePayload.items.flatMap((entry) => { const raw = record(entry); const kind = raw?.kind === "artifact" || raw?.kind === "work" ? raw.kind : ""; const id = text(raw?.id); return kind && id ? [{ kind, id, item: record(raw?.item) }] as ProjectScopeReference[] : []; }) : [];
  const items = mapProjectScopePayload(references, assets, projectId);
  await Promise.all(items.filter((item) => item.meta.project_asset).map(async (item) => {
    const assetId = text(item.meta.project_asset_id);
    if (!assetId) return;
    try {
      const file = await projectRequest<Record<string, unknown>>(projectPath(projectId, `/assets/${encodeURIComponent(assetId)}/file`), { signal });
      if (typeof file.text === "string") item.content = file.text;
      if (typeof file.mime_type === "string") item.meta.mime_type = file.mime_type;
      if (typeof file.url === "string" && file.url) item.url = file.url;
      const download = await projectRequest<{ url?: unknown }>(projectPath(projectId, `/assets/${encodeURIComponent(assetId)}/download`), { signal }).catch(() => null);
      if (typeof download?.url === "string" && download.url) { item.url = download.url; item.meta.open_url = download.url; }
    } catch { /* keep the card visible; the detail viewer can retry its source */ }
  }));
  return { references, assets, items, canEdit: ["owner", "edit", "editor"].includes(text(accessPayload.role)) };
}

export async function addProjectLibraryReference(projectId: string, kind: "artifact" | "work", id: string): Promise<void> {
  await projectRequest(projectPath(projectId, "/library-items"), { method: "POST", body: JSON.stringify({ kind, id }) });
}
export async function removeProjectLibraryReference(projectId: string, kind: "artifact" | "work", id: string): Promise<void> {
  await projectRequest(projectPath(projectId, `/library-items/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`), { method: "DELETE" });
}
export async function deleteProjectAsset(projectId: string, assetId: string): Promise<void> {
  await projectRequest(projectPath(projectId, `/assets/${encodeURIComponent(assetId)}`), { method: "DELETE" });
}
export async function downloadProjectAsset(projectId: string, assetId: string, filename: string): Promise<void> {
  const result = await projectRequest<{ url?: unknown }>(projectPath(projectId, `/assets/${encodeURIComponent(assetId)}/download`));
  if (typeof result.url !== "string" || !result.url) throw new Error("download unavailable");
  if (typeof window !== "undefined") {
    const anchor = document.createElement("a"); anchor.href = result.url; anchor.download = filename; anchor.target = "_blank"; anchor.rel = "noreferrer"; anchor.click();
  }
}

export interface ProjectScopeState extends ProjectScopeResult { loading: boolean; error: string; }
export function useProjectLibraryScope(action: WorkspaceActionEnvelope | null | undefined): ProjectScopeState & { reload: () => void } {
  const projectId = action?.action.projectId;
  const epoch = useRef(0);
  const [state, setState] = useState<ProjectScopeState>({ items: [], references: [], assets: [], canEdit: false, loading: Boolean(projectId), error: "" });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((value) => value + 1), []);
  useEffect(() => {
    if (!projectId) { setState({ items: [], references: [], assets: [], canEdit: false, loading: false, error: "" }); return; }
    const controller = new AbortController();
    const current = ++epoch.current;
    setState((value) => ({ ...value, loading: true, error: "" }));
    void loadProjectLibraryScope(projectId, controller.signal).then((result) => { if (current === epoch.current) setState({ ...result, loading: false, error: "" }); }).catch((error) => { if (controller.signal.aborted || current !== epoch.current) return; setState((value) => ({ ...value, loading: false, error: error instanceof Error ? error.message : "project scope unavailable" })); });
    return () => controller.abort();
  }, [projectId, nonce]);
  return useMemo(() => ({ ...state, reload }), [reload, state]);
}
