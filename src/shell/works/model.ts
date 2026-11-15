import { normalizeLinkWork, type LinkWork } from "./link-work-item";

import { DEFAULT_WORK_KIND, normalizeWorkKind, fallbackKindLabel, type WorkKind } from "./kinds";
export type { WorkKind } from "./kinds";
export type WorkPreviewSource = { type: "url"; path?: string } | { type: "screen"; device_id: string; display_id?: number | null } | { type: "none" };
export type WorkStatus = "draft" | "published" | "running" | "stopped" | "error" | "offline";
export type WorkLocation =
  | { type: "cloud"; artifact_id?: string; project_id?: string }
  | { type: "server"; computer_id: string; computer_name: string; path: string };

export interface WorkPreview {
  available: boolean;
  url?: string;
}

export interface WorkLink {
  label: string;
  url: string;
}

export interface Work {
  id: string;
  title: string;
  kind: WorkKind;
  home: WorkLocation;
  preview: WorkPreview;
  links: WorkLink[];
  status: WorkStatus;
  updated_at: string;
  access?: "owner" | "view";
  play_url?: string;
  orientation?: "portrait" | "landscape" | "any";
  preview_source?: WorkPreviewSource;
}

export interface WorkPreviewResult {
  status: "starting" | "ready" | "failed";
  url?: string;
  stage?: string;
  reason?: string;
}

export interface ServerWork {
  id: string;
  title: string;
  kind: WorkKind;
  status: WorkStatus;
  updated_at: string;
  home: { type: "server"; computer_id: string; computer_name: string; path: string };
  preview: WorkPreview;
  server_work: { id: string; computer_id: string; computer_name: string; path: string };
}

/** /library/mine keeps its serverWorks field for both server and link works. */
export type LinkLibraryWork = LinkWork & {
  source_type: "link";
  home: { type: "link" };
  link_work: LinkWork;
};
export type LibraryWork = ServerWork | LinkLibraryWork;

export function normalizeLibraryWork(value: unknown): LibraryWork | null {
  if (!isRecord(value)) return null;
  const home = isRecord(value.home) ? value.home : null;
  const nested = isRecord(value.link_work) ? value.link_work : null;
  if (value.source_type === "link" || home?.type === "link" || nested) {
    const link = normalizeLinkWork({ ...value, ...nested });
    return link ? { ...link, source_type: "link", home: { type: "link" }, link_work: link } : null;
  }
  return normalizeServerWork(value);
}

export interface WorkStopResult {
  ok: boolean;
}

export function normalizeServerWork(value: unknown): ServerWork | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const title = text(value.title);
  const home = isRecord(value.home) ? value.home : null;
  const server = isRecord(value.server_work) ? value.server_work : null;
  if (!id || !title || !home || home.type !== "server" || !server) return null;
  const computerId = text(home.computer_id) || text(server.computer_id);
  const path = text(home.path) || text(server.path);
  if (!computerId || !path) return null;
  const computerName = text(home.computer_name) || text(server.computer_name) || computerId;
  const kind = normalizeWorkKind(value.kind);
  const status = STATUSES.has(value.status as WorkStatus) ? value.status as WorkStatus : "draft";
  const previewValue = isRecord(value.preview) ? value.preview : {};
  return {
    id, title, kind, status, updated_at: text(value.updated_at) || new Date(0).toISOString(),
    home: { type: "server", computer_id: computerId, computer_name: computerName, path },
    preview: { available: previewValue.available === true, ...(isUserContentUrl(text(previewValue.url)) ? { url: text(previewValue.url) } : {}) },
    server_work: { id, computer_id: computerId, computer_name: computerName, path },
  };
}

export interface WorkUpdate {
  title?: string;
  kind?: WorkKind;
  start_command?: string;
  port?: number;
  links?: WorkLink[];
  note?: string;
}

export interface WorkLink { label: string; url: string }

const STATUSES = new Set<WorkStatus>(["draft", "published", "running", "stopped", "error", "offline"]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export function isUserContentUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".oceanleo.app") && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

function normalizeLocation(value: unknown): WorkLocation | null {
  if (!isRecord(value)) return null;
  const type = value.type === "server" ? "server" : value.type === "cloud" ? "cloud" : "";
  if (!type) return null;
  if (type === "server") {
    const computerId = text(value.computer_id);
    const path = text(value.path);
    if (!computerId || !path) return null;
    return {
      type,
      computer_id: computerId,
      computer_name: text(value.computer_name) || computerId,
      path,
    };
  }
  return {
    type,
    ...(text(value.artifact_id) ? { artifact_id: text(value.artifact_id) } : {}),
    ...(text(value.project_id) ? { project_id: text(value.project_id) } : {}),
  };
}

export function normalizeWork(value: unknown): Work | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const title = text(value.title);
  const home = normalizeLocation(value.home);
  if (!id || !title || !home) return null;
  const kind = normalizeWorkKind(value.kind);
  const status = STATUSES.has(value.status as WorkStatus) ? value.status as WorkStatus : "draft";
  const previewValue = isRecord(value.preview) ? value.preview : {};
  const links = Array.isArray(value.links)
    ? value.links.flatMap((link) => {
        if (!isRecord(link)) return [];
        const label = text(link.label);
        const url = text(link.url);
        return label && /^https?:\/\//i.test(url) ? [{ label, url }] : [];
      })
    : [];
  return {
    id,
    title,
    kind,
    home,
    preview: {
      available: previewValue.available === true,
      ...(isUserContentUrl(text(previewValue.url)) ? { url: text(previewValue.url) } : {}),
    },
    links,
    ...(value.access === "view" || value.access === "owner" ? { access: value.access } : {}),
    ...(isUserContentUrl(text(value.play_url)) ? { play_url: text(value.play_url) } : {}),
    ...(value.orientation === "portrait" || value.orientation === "landscape" || value.orientation === "any" ? { orientation: value.orientation } : {}),
    ...(isRecord(value.preview_source) ? { preview_source: value.preview_source as WorkPreviewSource } : {}),
    status,
    updated_at: text(value.updated_at) || new Date(0).toISOString(),
  };
}

export function workLocationLabel(work: Work): string {
  if (work.home.type === "server") return `${work.home.computer_name} · ${work.home.path}`;
  return "云端";
}

export function workKindLabel(kind: WorkKind): string {
  return fallbackKindLabel(kind);
}

export function workStatusLabel(status: WorkStatus): string {
  return ({ draft: "草稿", published: "已发布", running: "运行中", stopped: "已停止", error: "出错", offline: "离线" })[status];
}

/** Folder names do not choose a different execution path. */
export function workDraftForPath(_path: string): { kind: WorkKind; start_command: string; port: number } {
  return { kind: DEFAULT_WORK_KIND, start_command: "npm run dev", port: 3000 };
}
