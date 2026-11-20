"use client";

/**
 * Versioned, deliberately small protocol used by a trusted agent tool receipt
 * to control the right-hand workspace.  Free-form assistant text is never
 * parsed as an action.
 */
export type WorkspaceSlotId =
  | "template"
  | "preview"
  | "materials"
  | "mine"
  | "browser";

/** 右侧栏里可见槽位之外的两块：LeoBay 缩小版、LeoChat。它们不是槽位，不进 `FIXED_WORKSPACE_SLOTS`。 */
export type WorkspacePanelId = "bay" | "leochat";

/** 右侧栏此刻显示的是什么：卡片首页、某个槽位，或上面那两块之一。 */
export type WorkspaceManagedPanelId = "devices" | "projects" | "settings" | "tasks";
export type WorkspaceViewId = "home" | WorkspaceSlotId | WorkspacePanelId | WorkspaceManagedPanelId | "task" | "quote";

/**
 * The one task the right panel shows (session / sites wave 2026-11-21: no stack, no rooms). `kind` stays so a
 * caller written as `{ kind: "agent_task", id, title }` keeps compiling.
 */
export interface WorkspaceTaskEntry {
  kind: "agent_task";
  id: string;
  title: string;
}

/** A task id and title as trusted UI data: a safe id, a bounded title. Anything else is ignored. */
export function normalizeTaskEntry(value: unknown): WorkspaceTaskEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== undefined && raw.kind !== "agent_task") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
  return { kind: "agent_task", id, title };
}

/**
 * 一条 action 能指向哪里：可见槽位及 materials 兼容输入，加上 `bay`（agent 的「找真人」工具让右侧栏显示相关服务）。
 * LeoChat 没有 agent 入口，所以不在这里。
 */
export type WorkspaceActionTab = WorkspaceSlotId | "bay" | Exclude<WorkspaceManagedPanelId, "tasks"> | "leochat" | "task";

/**
 * What the receiver should do with `itemId` once it resolves it.
 *
 * `open` (the default, and what every existing receipt means) reveals the item
 * in its library detail; the user still presses Edit. `edit` is only issued by
 * a first-party deep link that already names one exact artifact — the catalog
 * template-edit entry — and asks the receiver to hand that item straight to the
 * typed advanced editor. Anything else is treated as `open`: an unknown intent
 * must never silently become an editor launch.
 */
export type WorkspaceActionIntent = "open" | "edit";

import type { AssetRef } from "./asset-detail/types";
import { domainFamilyProfile, familyForHost, runtimePageOrigin } from "../contracts/domain-family";
import { isLeoDevPreviewHost } from "../lib/auth/config";

const WORKSPACE_ACTION_INTENTS: readonly WorkspaceActionIntent[] = [
  "open",
  "edit",
] as const;

export interface WorkspaceActionV1 {
  version: 1 | 2;
  tab: WorkspaceActionTab;
  query?: string;
  category?: string;
  itemId?: string;
  /** Catalog card id. Distinct from `itemId` (artifact / material id). */
  entryId?: string;
  url?: string;
  browserSessionId?: string;
  intent?: WorkspaceActionIntent;
  /** Compatibility materials requests land in LeoBay, preserving exact identities. */
  view?: "materials";
  revisionId?: string;
  /** Library collection filter on top of `category` (only `uploaded` exists). */
  filter?: WorkspaceLibraryFilter;
  /** V2 capability-pack targets; absent on legacy receipts. */
  section?: string;
  prefill?: WorkspaceActionPrefill;
  deviceId?: string;
  /** Project selection for V2 configuration requests; legacy Library scope. */
  projectId?: string;
  /** Display-only project name, trimmed and bounded by the receipt parser. */
  projectName?: string;
}

export type WorkspaceActionPrefill = Readonly<Record<string, string>>;

/** Version 2 adds the capability-pack page targets while keeping V1 fields. */
export interface WorkspaceActionV2 extends Omit<WorkspaceActionV1, "version"> {
  version: 2;
  tab: WorkspaceActionTab;
  section?: string;
  prefill?: WorkspaceActionPrefill;
  deviceId?: string;
}

export type WorkspaceAction = WorkspaceActionV1;

/** `uploaded` = the Library "Uploaded" filter (files the user uploaded, any type). */
export type WorkspaceLibraryFilter = "uploaded";

export interface WorkspaceActionEnvelope {
  /** Omitted for existing page-wide callers; embedded tasks name their outer workspace. */
  instanceId?: string;
  nonce: string;
  action: WorkspaceAction;
}

/** agent 让右侧栏里的 LeoBay 找相关服务。`nonce` 变了才算一条新请求。 */
export interface WorkspaceBayRequest {
  /** Exact first-party Bay destination from a message. */
  href?: string;
  nonce: string;
  /** 关键词，空格分隔；可以是空串（只按类目找）。 */
  query: string;
  /** 站 key；不给就用当前所在的站。 */
  category?: string;
  view?: "materials";
  target?: AssetRef;
  intent?: WorkspaceActionIntent;
}

/** 让右侧栏里的 LeoChat 停在某条会话（「先聊聊」带过来的）。`nonce` 变了才算一条新请求。 */
export interface WorkspaceChatRequest {
  nonce: string;
  conversationId: string;
}

export const WORKSPACE_ACTION_EVENT = "oceanleo:workspace-action";

export const FIXED_WORKSPACE_SLOTS: readonly WorkspaceSlotId[] = [
  "template",
  "preview",
  "mine",
  "browser",
] as const;

export const WORKSPACE_PANELS: readonly WorkspacePanelId[] = [
  "bay",
  "leochat",
] as const;

/** action 的 `tab` 白名单：可见槽位、兼容 materials 输入 + `bay`。 */
export const WORKSPACE_ACTION_TABS: readonly WorkspaceActionTab[] = [
  ...FIXED_WORKSPACE_SLOTS,
  "materials", // Accepted input only; normalized to the LeoBay material view.
  "bay",
  "devices",
  "projects",
  "settings",
  "leochat",
] as const;

export function isWorkspaceSlotId(value: unknown): value is WorkspaceSlotId {
  return (
    typeof value === "string" &&
    (FIXED_WORKSPACE_SLOTS as readonly string[]).includes(value)
  );
}

const SLOT_ALIASES: Record<string, WorkspaceSlotId> = {
  __guide: "template",
  guide: "template",
  navigator: "template",
  template: "template",
  templates: "template",
  result: "preview",
  results: "preview",
  preview: "preview",
  artifact: "preview",
  material: "materials",
  materials: "materials",
  inspiration: "materials",
  style: "materials",
  files: "mine",
  file: "mine",
  library: "mine",
  database: "mine",
  works: "mine",
  mine: "mine",
  mylib: "mine",
  my_library: "mine",
  favorites: "mine",
  favourites: "mine",
  browser: "browser",
  cloud_browser: "browser",
};

/** Unknown legacy tabs are product-specific pages and therefore previews. */
export function workspaceSlotForLegacyId(id: string): WorkspaceSlotId {
  const normalized = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return SLOT_ALIASES[normalized] || "preview";
}

export function normalizeWorkspaceAction(
  value: unknown,
): WorkspaceActionV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const version = Number(raw.version);
  if (version !== 1 && version !== 2) return null;
  const tab = String(raw.tab || "") as WorkspaceActionTab;
  if (!WORKSPACE_ACTION_TABS.includes(tab)) return null;
  // Managed capability pages were introduced with V2. Keep the legacy V1
  // parser's rejection behavior for those names while browser remains a V1
  // compatibility route.
  if (version === 1 && ["devices", "projects", "settings", "leochat"].includes(tab)) return null;
  const clean = (key: string, max = 500) => {
    const text = typeof raw[key] === "string" ? String(raw[key]).trim() : "";
    return text ? text.slice(0, max) : undefined;
  };
  const rawUrl = clean("url", 2000);
  let url: string | undefined;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        url = parsed.toString();
      }
    } catch {
      // Receipt payloads must never turn into javascript:/data: links.
    }
  }
  // Absent unless explicitly and validly requested: every receipt written
  // before this field existed must keep normalizing to the exact same object.
  const rawIntent = clean("intent", 16) as WorkspaceActionIntent | undefined;
  const intent =
    rawIntent && WORKSPACE_ACTION_INTENTS.includes(rawIntent)
      ? rawIntent
      : undefined;
  const entryId = clean("entryId", 300);
  const rawProjectId = clean("projectId", 80);
  const projectId = version === 2 && tab === "projects" ? rawProjectId : rawProjectId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawProjectId)
    ? rawProjectId.toLowerCase()
    : undefined;
  const projectName = clean("projectName", 120);
  const filter = clean("filter", 16) === "uploaded" ? "uploaded" as const : undefined;
  const section = version === 2 ? clean("section", 80) : undefined;
  const deviceId = version === 2 ? clean("deviceId", 300) : undefined;
  const prefill = version === 2 && raw.prefill && typeof raw.prefill === "object" && !Array.isArray(raw.prefill)
    ? Object.fromEntries(Object.entries(raw.prefill as Record<string, unknown>)
      .filter(([key, item]) => ["name", "kind", "target"].includes(key) && typeof item === "string")
      .map(([key, item]) => [key, String(item).trim().slice(0, 300)])
      .filter(([, item]) => item))
    : undefined;
  return {
    version: version as 1 | 2,
    tab: tab === "materials" ? "bay" : tab,
    ...(tab === "materials" || raw.view === "materials" ? { view: "materials" as const } : {}),
    ...(clean("revisionId", 300) ? { revisionId: clean("revisionId", 300) } : {}),
    query: clean("query", 200),
    category: clean("category", 100),
    itemId: clean("itemId", 300),
    url,
    browserSessionId: clean("browserSessionId", 300),
    ...(entryId ? { entryId } : {}),
    ...(intent ? { intent } : {}),
    ...(filter ? { filter } : {}),
    ...(section ? { section } : {}),
    ...(prefill && Object.keys(prefill).length ? { prefill } : {}),
    ...(deviceId ? { deviceId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(projectName ? { projectName } : {}),
  } as WorkspaceActionV1;
}


/** Legacy names remain recognizable while no longer owning a visible slot. */
export function isLegacyMaterialsId(id: string | null | undefined): boolean {
  return workspaceSlotForLegacyId(id || "") === "materials";
}

/** Unprefixed old item IDs are artifacts; a catalog entry ID is never an artifact ID. */
export function workspaceMaterialAssetRef(action: WorkspaceActionV1): AssetRef | undefined {
  const id = action.itemId;
  if (id) {
    for (const prefix of ["library:", "platform:", "platform_assets:"]) {
      if (id.startsWith(prefix)) return { kind: "platform", id: id.slice(prefix.length) };
    }
    for (const prefix of ["template-material:", "template:"]) {
      if (id.startsWith(prefix)) return { kind: "template", id: id.slice(prefix.length) };
    }
    if (id.startsWith("listing:")) return { kind: "listing", id: id.slice(8) };
    if (/^(openverse|pexels|polyhaven|ambientcg|sketchfab|iconify|fontsource|google-fonts):/.test(id)) return { kind: "platform", id };
    const [artifactId, pinnedRevision] = id.replace(/^artifact:/, "").split(":");
    return { kind: "artifact", artifactId, ...(action.revisionId || pinnedRevision ? { revisionId: action.revisionId || pinnedRevision } : {}) };
  }
  if (action.entryId) return { kind: "template", id: action.entryId.replace(/^template(?:-material)?:/, "") };
  return undefined;
}

/** Older raw-asset bookmarks did not carry an artifact item or a catalog dispatcher. */
export function workspaceMaterialsActionFromSearch(search: string): WorkspaceActionV1 | null {
  const params = new URLSearchParams(search);
  if (!isLegacyMaterialsId(params.get("tab"))) return null;
  return normalizeWorkspaceAction({
    version: 1, tab: "materials", query: params.get("q") || params.get("query"), category: params.get("category"),
    itemId: params.get("item") || params.get("artifactId") || params.get("asset"), entryId: params.get("entryId"),
    revisionId: params.get("revisionId") || params.get("revision"), intent: params.get("mode") === "edit" ? "edit" : "open",
  });
}

export function dispatchWorkspaceAction(envelope: WorkspaceActionEnvelope): boolean {
  if (typeof window === "undefined") return false;
  return !window.dispatchEvent(
    new window.CustomEvent<WorkspaceActionEnvelope>(WORKSPACE_ACTION_EVENT, {
      detail: envelope,
      cancelable: true,
    }),
  );
}

// Sub-site hosts are gone (session / sites wave 2026-11-21): only a family's portal host is a product page.
function productHost(hostname: string): boolean {
  const family = familyForHost(hostname);
  if (!family) return false;
  return hostname === domainFamilyProfile(family).registrableDomain;
}

/** Resolve only product pages the workspace can actually display. No content host is trusted. */
export function workspaceActionForHref(href: string, origin: string): WorkspaceAction | null {
  let url: URL;
  let pageOrigin: string;
  try {
    const page = new URL(origin);
    pageOrigin = page.origin;
    url = new URL(href, page);
  } catch { return null; }
  if (!["https:", "http:"].includes(url.protocol)) return null;
  if (url.port || url.username || url.password) return null;
  // A preview may route its own content, never another preview's content.
  const ownDevHost = url.origin === pageOrigin && !url.hostname.endsWith(".") && isLeoDevPreviewHost(url.hostname);
  if (!productHost(url.hostname) && !ownDevHost) return null;
  if (url.protocol !== "https:" && url.origin !== pageOrigin) return null;
  const path = url.pathname.replace(/\/$/, "") || "/";
  const params = url.searchParams;
  const itemId = params.get("item") || params.get("artifactId") || undefined;
  const revisionId = params.get("revisionId") || params.get("revision") || undefined;
  if (path === "/bay") {
    const material = params.get("asset") || itemId || (params.get("listingId") ? `listing:${params.get("listingId")}` : undefined);
    return { version: 1, tab: "bay", url: url.href,
      ...(material ? { view: "materials", itemId: material, revisionId } : {}),
      ...(params.get("q") ? { query: params.get("q")! } : {}) };
  }
  if (path === "/library" || path === "/history" ||
      (/^\/workspace(?:\/[a-z0-9][a-z0-9_-]*){0,2}$/.test(path) && params.get("tab") === "library" && itemId)) {
    return { version: 1, tab: "mine", itemId, revisionId };
  }
  const project = path.match(/^\/projects(?:\/([a-zA-Z0-9][a-zA-Z0-9_-]*))?$/);
  if (project) return { version: 2, tab: "projects", projectId: project[1] || params.get("projectId") || undefined };
  const managed = path.match(/^\/(settings|devices)(?:\/([a-z0-9][a-z0-9_-]*))?$/);
  if (managed) return { version: 2, tab: managed[1] as "settings" | "devices", section: managed[2] || params.get("section") || undefined, deviceId: params.get("deviceId") || undefined };
  if (path === "/browser") return { version: 2, tab: "devices", section: "cloud-browser" };
  return null;
}

let revealSequence = 0;

/**
 * Ask the split that hosts this workspace to show its right pane (it opens on any workspace action for
 * its instance). `tab: "task"` is deliberately not in `WORKSPACE_ACTION_TABS`: no receipt can send it and
 * every action receiver ignores it, so this only reveals the pane the task / quote view is already in.
 */
export function revealWorkspacePane(instanceId: string): boolean {
  return dispatchWorkspaceAction({ instanceId, nonce: `task-reveal:${++revealSequence}`, action: { version: 2, tab: "task" } });
}

let messageLinkSequence = 0;

/** True only when a mounted workspace accepted the click, so other hosts keep their normal link behavior. */
export function openWorkspaceHref(href: string): boolean {
  const origin = runtimePageOrigin();
  if (!origin) return false;
  const action = workspaceActionForHref(href, origin);
  if (!action) return false;
  return dispatchWorkspaceAction({ nonce: `message-link:${++messageLinkSequence}`, action });
}

const CONSUMED_NONCE_CAP = 64;
const consumedKeys = new Set<string>();
const consumedOrder: string[] = [];

function consumptionKey(nonce: string, consumer: string): string {
  return `${nonce}\u0000${consumer}`;
}

function evictConsumedNonce(nonce: string): void {
  const prefix = `${nonce}\u0000`;
  for (const key of [...consumedKeys]) {
    if (key.startsWith(prefix)) consumedKeys.delete(key);
  }
}

export function isWorkspaceActionConsumed(
  nonce: string,
  consumer?: string,
): boolean {
  const id = String(nonce || "").trim();
  if (!id) return false;
  if (consumer) return consumedKeys.has(consumptionKey(id, consumer));
  const prefix = `${id}\u0000`;
  for (const key of consumedKeys) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/** First claim for this consumer wins. Later claims (including remount) skip. */
export function consumeWorkspaceAction(
  nonce: string,
  consumer: string,
): boolean {
  const id = String(nonce || "").trim();
  const who = String(consumer || "").trim();
  if (!id || !who) return false;
  const key = consumptionKey(id, who);
  if (consumedKeys.has(key)) return false;
  consumedKeys.add(key);
  if (!consumedOrder.includes(id)) {
    consumedOrder.push(id);
    while (consumedOrder.length > CONSUMED_NONCE_CAP) {
      const oldest = consumedOrder.shift();
      if (oldest) evictConsumedNonce(oldest);
    }
  }
  return true;
}

export function resetWorkspaceActionConsumptionForTests(): void {
  consumedKeys.clear();
  consumedOrder.length = 0;
}
