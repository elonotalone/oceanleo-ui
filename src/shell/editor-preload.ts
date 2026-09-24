import { HOSTED_EDITOR_ORIGINS } from "./hosted-editor-origins";
import type { LibraryItem, LibraryKind } from "./library-data";
import {
  prefetchOfficeSource,
  sourceHintForItem,
} from "./office-editor/office-source-cache";
import { editorCapabilityFor } from "./workbench-routes";

export const EDITOR_HOVER_PRELOAD_MS = 150;

export interface EditorPreloadResult {
  routeIds: string[];
  codeReady: boolean;
  sourceReady: boolean;
}

type RouteLoader = () => Promise<unknown>;

const routeLoaders = new Map<string, RouteLoader>();
const routeInflight = new Map<string, Promise<unknown>>();

export interface EditorHoverScheduler {
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (id: unknown) => void;
}

function defaultSchedule(fn: () => void, ms: number): unknown {
  return typeof window !== "undefined"
    ? window.setTimeout(fn, ms)
    : setTimeout(fn, ms);
}

function defaultCancel(id: unknown): void {
  const handle = id as number;
  if (typeof window !== "undefined") window.clearTimeout(handle);
  else clearTimeout(handle);
}

let hoverScheduler: EditorHoverScheduler = {
  schedule: defaultSchedule,
  cancel: defaultCancel,
};

export function registerEditorRouteLoader(
  routeId: string,
  load: RouteLoader,
): void {
  routeLoaders.set(routeId, load);
}

export function configureEditorHoverSchedulerForTests(
  next?: EditorHoverScheduler,
): void {
  hoverScheduler = next ?? {
    schedule: defaultSchedule,
    cancel: defaultCancel,
  };
}

export function resetEditorPreloadForTests(): void {
  routeInflight.clear();
}

export async function loadEditorModuleWithRetry<T>(
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch {
    return await load();
  }
}

export function preloadEditorRoute(routeId: string): Promise<unknown> {
  const load = routeLoaders.get(routeId);
  if (!load) return Promise.resolve(null);
  const existing = routeInflight.get(routeId);
  if (existing) return existing;
  const work = loadEditorModuleWithRetry(load).catch(() => null);
  routeInflight.set(routeId, work);
  return work;
}

export function routeIdsForItem(item: LibraryItem): string[] {
  const capability = editorCapabilityFor(item);
  const ids: string[] = [];
  if (capability.adapter && capability.adapter !== "none") {
    ids.push(capability.adapter);
  }
  if (capability.route.type && capability.route.type !== "none") {
    ids.push(capability.route.type);
  }
  return ids;
}

export async function preloadEditorFor(
  item: LibraryItem,
): Promise<EditorPreloadResult> {
  const routeIds = routeIdsForItem(item);
  const hint = sourceHintForItem(item);
  const codeWork = Promise.all(routeIds.map((id) => preloadEditorRoute(id)));
  const sourceWork = hint.url
    ? prefetchOfficeSource(item).catch(() => null)
    : Promise.resolve(null);
  const [codeParts, source] = await Promise.all([codeWork, sourceWork]);
  return {
    routeIds,
    codeReady: codeParts.some((part) => part != null) || routeIds.length === 0,
    sourceReady: !hint.url || source != null,
  };
}

const PRECONNECT_ATTR = "data-oleo-editor-preconnect";

export function ensureHostedEditorPreconnect(
  doc: Document | null = typeof document === "undefined" ? null : document,
): void {
  if (!doc?.head) return;
  for (const origin of HOSTED_EDITOR_ORIGINS) {
    const existing = doc.head.querySelector(
      `link[rel="preconnect"][${PRECONNECT_ATTR}="${origin}"]`,
    );
    if (existing) continue;
    const link = doc.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.setAttribute(PRECONNECT_ATTR, origin);
    doc.head.append(link);
  }
}

const SITE_HOME_ROUTE: Record<string, string> = {
  website: "embed",
  design: "embed",
  video: "video-timeline",
  image: "image",
  audio: "audio",
  slides: "deck",
  ppt: "deck",
  deck: "deck",
  docs: "richdoc",
  word: "richdoc",
  document: "richdoc",
  pdf: "pdf",
  sheet: "grid",
  excel: "grid",
  grid: "grid",
  chart: "chart-editor@1",
  "3d": "threed",
  threed: "threed",
  game: "game",
};

const FEATURE_HOME_ROUTE: Record<string, string> = {
  video_editing: "video-timeline",
  website_finetuning: "embed",
  design_canvas: "embed",
  presentation_editing: "deck",
  document_editing: "richdoc",
  spreadsheet_editing: "grid",
};

export function siteHomeEditorRouteId(
  siteKey = "",
  pathname = "",
): string {
  const feature = /\/advanced\/([^/?#]+)/.exec(pathname)?.[1] || "";
  if (feature && FEATURE_HOME_ROUTE[feature]) return FEATURE_HOME_ROUTE[feature];
  const key = siteKey.trim().toLowerCase();
  if (key && SITE_HOME_ROUTE[key]) return SITE_HOME_ROUTE[key];
  return "";
}

function inferSiteKey(): string {
  if (typeof location === "undefined") return "";
  const host = location.hostname || "";
  return host.split(".")[0] || "";
}

export function scheduleSiteHomeEditorPreload(
  siteKey = inferSiteKey(),
  pathname = typeof location === "undefined" ? "" : location.pathname,
): () => void {
  const routeId = siteHomeEditorRouteId(siteKey, pathname);
  if (!routeId) return () => {};
  if (typeof window === "undefined") {
    void preloadEditorRoute(routeId);
    return () => {};
  }
  if (typeof requestIdleCallback === "function") {
    const idle = requestIdleCallback(() => {
      void preloadEditorRoute(routeId);
    });
    return () => cancelIdleCallback(idle);
  }
  const timer = window.setTimeout(() => {
    void preloadEditorRoute(routeId);
  }, 1);
  return () => window.clearTimeout(timer);
}

const CARD_ATTRS = [
  "data-cover-artifact-type",
  "data-artifact-id",
  "data-revision-id",
  "data-item-url",
  "data-item-kind",
  "data-library-item-key",
  "data-material-card-download",
] as const;

function readAttr(root: Element, name: string): string {
  const own = root.getAttribute(name);
  if (own) return own;
  return root.querySelector(`[${name}]`)?.getAttribute(name) || "";
}

function looksLikeShelfGrid(node: Element): boolean {
  return (
    node.hasAttribute("data-workspace-card-grid") ||
    node === node.ownerDocument?.body ||
    node === node.ownerDocument?.documentElement
  );
}

function isElement(value: EventTarget | null): value is Element {
  return Boolean(
    value &&
      typeof value === "object" &&
      "nodeType" in value &&
      (value as Node).nodeType === 1,
  );
}

export function findLibraryCardElement(start: EventTarget | null): Element | null {
  if (!isElement(start)) return null;
  const direct = start.closest(CARD_ATTRS.map((name) => `[${name}]`).join(","));
  if (direct && !looksLikeShelfGrid(direct)) return direct;
  let node: Element | null = start;
  while (node && !looksLikeShelfGrid(node)) {
    if (CARD_ATTRS.some((name) => node?.getAttribute(name))) return node;
    if (node.querySelector("[data-cover-artifact-type]")) return node;
    node = node.parentElement;
  }
  return null;
}

function kindFromHint(hint: string): LibraryKind | "" {
  const value = hint.trim().toLowerCase();
  if (value === "ppt" || value === "deck" || value === "presentation" || value === "pptx") {
    return "ppt";
  }
  if (value === "document" || value === "richdoc" || value === "docx") return "document";
  if (value === "sheet" || value === "xlsx" || value === "grid") return "sheet";
  if (value === "website") return "website";
  if (value === "canvas") return "canvas";
  if (value === "image") return "image";
  if (value === "video") return "video";
  if (value === "video_canvas") return "video_canvas";
  if (value === "audio") return "audio";
  if (value === "threed" || value === "3d") return "threed";
  if (value === "game") return "game";
  if (value === "file" || value === "pdf") return "file";
  return "";
}

export function libraryItemFromCardElement(root: Element): LibraryItem | null {
  const artifactType = readAttr(root, "data-cover-artifact-type");
  const artifactId =
    readAttr(root, "data-artifact-id") ||
    readAttr(root, "data-material-card-download");
  const revisionId = readAttr(root, "data-revision-id");
  const url = readAttr(root, "data-item-url");
  const kind = kindFromHint(
    readAttr(root, "data-item-kind") || artifactType,
  );
  const key =
    readAttr(root, "data-library-item-key") || artifactId || url || kind;
  if (!key && !kind && !url) return null;
  return {
    key: key || "preload",
    source: artifactId ? "artifact" : "creation",
    id: artifactId || key || "preload",
    title: "",
    kind: kind || "file",
    siteId: "",
    url: url || undefined,
    favorite: false,
    meta: {},
    artifactId: artifactId || undefined,
    revisionId: revisionId || undefined,
    artifactType: artifactType || undefined,
  };
}

export function installEditorHoverPreload(
  doc: Document | null = typeof document === "undefined" ? null : document,
): () => void {
  if (!doc) return () => {};
  let timer: unknown = 0;
  let active: Element | null = null;

  const clear = () => {
    if (timer) hoverScheduler.cancel(timer);
    timer = 0;
    active = null;
  };

  const arm = (card: Element) => {
    if (active === card && timer) return;
    if (timer) hoverScheduler.cancel(timer);
    active = card;
    timer = hoverScheduler.schedule(() => {
      timer = 0;
      const item = libraryItemFromCardElement(card);
      if (item) void preloadEditorFor(item);
    }, EDITOR_HOVER_PRELOAD_MS);
  };

  const onOver = (event: Event) => {
    const card = findLibraryCardElement(event.target);
    if (!card) return;
    const related =
      "relatedTarget" in event
        ? findLibraryCardElement(
            (event as MouseEvent | FocusEvent).relatedTarget,
          )
        : null;
    if (related === card) return;
    arm(card);
  };

  const onOut = (event: Event) => {
    const card = findLibraryCardElement(event.target);
    if (!card || card !== active) return;
    const related =
      "relatedTarget" in event
        ? findLibraryCardElement(
            (event as MouseEvent | FocusEvent).relatedTarget,
          )
        : null;
    if (related === card) return;
    clear();
  };

  doc.addEventListener("pointerover", onOver, true);
  doc.addEventListener("pointerout", onOut, true);
  doc.addEventListener("focusin", onOver, true);
  doc.addEventListener("focusout", onOut, true);
  return () => {
    clear();
    doc.removeEventListener("pointerover", onOver, true);
    doc.removeEventListener("pointerout", onOut, true);
    doc.removeEventListener("focusin", onOver, true);
    doc.removeEventListener("focusout", onOut, true);
  };
}
