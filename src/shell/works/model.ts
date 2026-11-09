export type WorkKind = "website" | "game" | "app" | "other";
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
}

export interface WorkPreviewResult {
  status: "starting" | "ready" | "failed";
  url?: string;
  stage?: string;
  reason?: string;
}

export interface WorkServerInput {
  computer_id: string;
  path: string;
  title?: string;
  kind?: WorkKind;
  start_command?: string;
  port?: number;
}

export interface MoveToServerInput {
  artifact_id: string;
  computer_id: string;
  path: string;
  title?: string;
}

export interface SaveToCloudInput {
  title?: string;
  slug?: string;
}

export interface SaveToCloudResult {
  project?: unknown;
  work_id: string;
}

export interface WorkStopResult {
  ok: boolean;
}

export interface WorkUpdate {
  title?: string;
  kind?: WorkKind;
  start_command?: string;
  port?: number;
}

const KINDS = new Set<WorkKind>(["website", "game", "app", "other"]);
const STATUSES = new Set<WorkStatus>(["draft", "published", "running", "stopped", "error", "offline"]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export function isUserContentUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".oceanleo.app");
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
  const kind = KINDS.has(value.kind as WorkKind) ? value.kind as WorkKind : "other";
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
    status,
    updated_at: text(value.updated_at) || new Date(0).toISOString(),
  };
}

export function workLocationLabel(work: Work): string {
  if (work.home.type === "server") return `${work.home.computer_name} · ${work.home.path}`;
  return "云端";
}

export function workKindLabel(kind: WorkKind): string {
  return ({ website: "网站", game: "游戏", app: "App", other: "其他" })[kind];
}

export function workStatusLabel(status: WorkStatus): string {
  return ({ draft: "草稿", published: "已发布", running: "运行中", stopped: "已停止", error: "出错", offline: "离线" })[status];
}

export function workDraftForPath(path: string): Pick<WorkServerInput, "kind" | "start_command" | "port"> {
  const lower = path.toLocaleLowerCase();
  if (lower.endsWith(".game") || lower.includes("game")) return { kind: "game", start_command: "npm run dev", port: 3000 };
  if (lower.includes("app")) return { kind: "app", start_command: "npm run dev", port: 3000 };
  return { kind: "website", start_command: "npm run dev", port: 3000 };
}
