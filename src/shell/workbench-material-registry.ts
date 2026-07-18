import type { LibraryItem } from "./library-data";
import type { WorkspaceLibraryEntry } from "./WorkspaceLibrary";

const EMPTY: readonly WorkspaceLibraryEntry[] = Object.freeze([]);
const EMPTY_ACTIONS: readonly WorkbenchMaterialAction[] = Object.freeze([]);

export interface WorkbenchMaterialPlacement {
  source: "click" | "drop";
  clientX?: number;
  clientY?: number;
}

export type WorkbenchMaterialAction = "insert" | "replace" | "apply" | "merge";

export interface WorkbenchMaterialAdapter {
  id: string;
  actions: readonly WorkbenchMaterialAction[];
  accepts: (item: LibraryItem, action: WorkbenchMaterialAction) => boolean;
  mutate: (
    action: WorkbenchMaterialAction,
    detachedItem: LibraryItem,
    placement?: WorkbenchMaterialPlacement,
  ) => Promise<void> | void;
}

export interface WorkbenchMaterialRuntimeSnapshot {
  actions: readonly WorkbenchMaterialAction[];
  draggedItem: LibraryItem | null;
}

interface RuntimeState {
  adapter: WorkbenchMaterialAdapter | null;
  adapterToken: symbol | null;
  draggedItem: LibraryItem | null;
}

const EMPTY_RUNTIME: WorkbenchMaterialRuntimeSnapshot = Object.freeze({
  actions: EMPTY_ACTIONS,
  draggedItem: null,
});
const runtimes = new Map<string, RuntimeState>();
const runtimeSnapshots = new Map<string, WorkbenchMaterialRuntimeSnapshot>();
const runtimeListeners = new Map<string, Set<() => void>>();
const sources = new Map<
  string,
  Map<symbol, readonly WorkspaceLibraryEntry[]>
>();
const snapshots = new Map<string, readonly WorkspaceLibraryEntry[]>();
const listeners = new Map<string, Set<() => void>>();

function runtimeFor(scope: string): RuntimeState {
  const current = runtimes.get(scope);
  if (current) return current;
  const created: RuntimeState = {
    adapter: null,
    adapterToken: null,
    draggedItem: null,
  };
  runtimes.set(scope, created);
  return created;
}

function emitRuntime(scope: string): void {
  const runtime = runtimes.get(scope);
  const actions = runtime?.adapter?.actions || EMPTY_ACTIONS;
  runtimeSnapshots.set(
    scope,
    Object.freeze({
      actions: actions.length ? Object.freeze([...actions]) : EMPTY_ACTIONS,
      draggedItem: runtime?.draggedItem || null,
    }),
  );
  runtimeListeners.get(scope)?.forEach((listener) => listener());
}

export function materialScopeKey(siteId: string, appId: string): string {
  const site = siteId.trim().toLowerCase() || "oceanleo";
  const app = appId.trim().toLowerCase() || "default";
  return `${site}::${app}`;
}

function jsonFingerprint(value: unknown): string {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return "";
  }
}

function sameMaterialEntry(
  left: WorkspaceLibraryEntry,
  right: WorkspaceLibraryEntry,
): boolean {
  if (left === right) return true;
  const leftItem = left.libraryItem;
  const rightItem = right.libraryItem;
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.description === right.description &&
    left.category === right.category &&
    left.thumbUrl === right.thumbUrl &&
    left.kind === right.kind &&
    left.externalUrl === right.externalUrl &&
    left.linkUrl === right.linkUrl &&
    left.badge === right.badge &&
    left.trustedSearchMatch === right.trustedSearchMatch &&
    left.content === right.content &&
    left.onDelete === right.onDelete &&
    leftItem?.key === rightItem?.key &&
    leftItem?.id === rightItem?.id &&
    leftItem?.title === rightItem?.title &&
    leftItem?.kind === rightItem?.kind &&
    leftItem?.siteId === rightItem?.siteId &&
    leftItem?.url === rightItem?.url &&
    leftItem?.previewUrl === rightItem?.previewUrl &&
    leftItem?.thumbUrl === rightItem?.thumbUrl &&
    leftItem?.content === rightItem?.content &&
    leftItem?.favorite === rightItem?.favorite &&
    leftItem?.createdAt === rightItem?.createdAt &&
    jsonFingerprint(leftItem?.meta) === jsonFingerprint(rightItem?.meta) &&
    jsonFingerprint(leftItem?.descriptor) ===
      jsonFingerprint(rightItem?.descriptor)
  );
}

function rebuild(scope: string): void {
  const seen = new Set<string>();
  const merged: WorkspaceLibraryEntry[] = [];
  for (const entries of sources.get(scope)?.values() || []) {
    for (const entry of entries) {
      const key =
        entry.libraryItem?.url ||
        entry.externalUrl ||
        entry.libraryItem?.key ||
        entry.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
  }
  const current = snapshots.get(scope) || EMPTY;
  if (
    current.length === merged.length &&
    current.every((entry, index) => sameMaterialEntry(entry, merged[index]))
  ) {
    return;
  }
  snapshots.set(scope, merged.length ? Object.freeze(merged) : EMPTY);
  listeners.get(scope)?.forEach((listener) => listener());
}

export function registerWorkbenchMaterialSource(
  scope: string,
  source: symbol,
  entries: readonly WorkspaceLibraryEntry[],
): () => void {
  const scoped = sources.get(scope) || new Map();
  scoped.set(source, entries);
  sources.set(scope, scoped);
  rebuild(scope);
  return () => {
    const current = sources.get(scope);
    current?.delete(source);
    if (!current?.size) sources.delete(scope);
    rebuild(scope);
  };
}

export function getWorkbenchMaterialSnapshot(
  scope: string,
): readonly WorkspaceLibraryEntry[] {
  return snapshots.get(scope) || EMPTY;
}

export function subscribeWorkbenchMaterials(
  scope: string,
  listener: () => void,
): () => void {
  const scoped = listeners.get(scope) || new Set();
  scoped.add(listener);
  listeners.set(scope, scoped);
  return () => {
    scoped.delete(listener);
    if (!scoped.size) listeners.delete(scope);
  };
}

export function registerWorkbenchMaterialAdapter(
  scope: string,
  adapter: WorkbenchMaterialAdapter,
): () => void {
  const runtime = runtimeFor(scope);
  const token = Symbol("workbench-material-adapter");
  runtime.adapter = adapter;
  runtime.adapterToken = token;
  emitRuntime(scope);
  return () => {
    const current = runtimes.get(scope);
    if (!current || current.adapterToken !== token) return;
    current.adapter = null;
    current.adapterToken = null;
    current.draggedItem = null;
    emitRuntime(scope);
  };
}

export function getWorkbenchMaterialRuntimeSnapshot(
  scope: string,
): WorkbenchMaterialRuntimeSnapshot {
  return runtimeSnapshots.get(scope) || EMPTY_RUNTIME;
}

export function subscribeWorkbenchMaterialRuntime(
  scope: string,
  listener: () => void,
): () => void {
  const scoped = runtimeListeners.get(scope) || new Set();
  scoped.add(listener);
  runtimeListeners.set(scope, scoped);
  return () => {
    scoped.delete(listener);
    if (!scoped.size) runtimeListeners.delete(scope);
  };
}

export function canPerformWorkbenchMaterial(
  scope: string,
  actionId: WorkbenchMaterialAction,
  item: LibraryItem,
): boolean {
  const adapter = runtimes.get(scope)?.adapter;
  return Boolean(
    adapter?.actions.includes(actionId) && adapter.accepts(item, actionId),
  );
}

export function performWorkbenchMaterial(
  scope: string,
  actionId: WorkbenchMaterialAction,
  item: LibraryItem,
  placement?: WorkbenchMaterialPlacement,
): void | Promise<void> {
  const adapter = runtimes.get(scope)?.adapter;
  if (
    !adapter?.actions.includes(actionId) ||
    !adapter.accepts(item, actionId)
  ) {
    throw new Error("当前编辑器已关闭或不支持这个素材动作。");
  }
  return adapter.mutate(
    actionId,
    cloneMaterialForWorkbench(item),
    placement,
  );
}

export function beginWorkbenchMaterialDrag(
  scope: string,
  item: LibraryItem,
): void {
  const runtime = runtimeFor(scope);
  runtime.draggedItem = cloneMaterialForWorkbench(item);
  emitRuntime(scope);
}

export function endWorkbenchMaterialDrag(scope: string): void {
  const runtime = runtimes.get(scope);
  if (!runtime?.draggedItem) return;
  runtime.draggedItem = null;
  emitRuntime(scope);
}

/** Editors always receive a detached value; curated/platform rows stay immutable. */
export function cloneMaterialForWorkbench(item: LibraryItem): LibraryItem {
  const cloneValue = <T>(value: T): T => {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
  };
  return {
    ...item,
    meta: cloneValue(item.meta),
    ...(item.descriptor
      ? { descriptor: cloneValue(item.descriptor) }
      : {}),
  };
}
