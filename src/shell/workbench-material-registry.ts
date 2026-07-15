import type { LibraryItem } from "./library-data";
import type { WorkspaceLibraryEntry } from "./WorkspaceLibrary";

const EMPTY: readonly WorkspaceLibraryEntry[] = Object.freeze([]);
const sources = new Map<
  string,
  Map<symbol, readonly WorkspaceLibraryEntry[]>
>();
const snapshots = new Map<string, readonly WorkspaceLibraryEntry[]>();
const listeners = new Map<string, Set<() => void>>();

export function materialScopeKey(siteId: string, appId: string): string {
  const site = siteId.trim().toLowerCase() || "oceanleo";
  const app = appId.trim().toLowerCase() || "default";
  return `${site}::${app}`;
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
