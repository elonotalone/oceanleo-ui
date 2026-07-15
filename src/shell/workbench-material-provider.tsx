"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { LibraryItem } from "./library-data";
import type { WorkspaceLibraryEntry } from "./WorkspaceLibrary";
import {
  cloneMaterialForWorkbench,
  getWorkbenchMaterialSnapshot,
  materialScopeKey,
  subscribeWorkbenchMaterials,
} from "./workbench-material-registry";

export type WorkbenchMaterialAction = "insert" | "replace" | "apply" | "merge";

export interface WorkbenchMaterialAdapter {
  id: string;
  actions: readonly WorkbenchMaterialAction[];
  accepts: (item: LibraryItem, action: WorkbenchMaterialAction) => boolean;
  mutate: (
    action: WorkbenchMaterialAction,
    detachedItem: LibraryItem,
  ) => Promise<void> | void;
}

interface WorkbenchMaterialContextValue {
  siteId: string;
  appId: string;
  scope: string;
  entries: readonly WorkspaceLibraryEntry[];
  actions: readonly WorkbenchMaterialAction[];
  registerAdapter: (adapter: WorkbenchMaterialAdapter) => () => void;
  canPerform: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => boolean;
  perform: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => Promise<{ ok: boolean; error?: string }>;
}

const WorkbenchMaterialContext =
  createContext<WorkbenchMaterialContextValue | null>(null);

export function WorkbenchMaterialProvider({
  siteId,
  appId,
  children,
}: {
  siteId: string;
  appId: string;
  children: ReactNode;
}) {
  const scope = materialScopeKey(siteId, appId);
  const adapterRef = useRef<WorkbenchMaterialAdapter | null>(null);
  const [adapterRevision, setAdapterRevision] = useState(0);
  const entries = useSyncExternalStore(
    useCallback(
      (listener) => subscribeWorkbenchMaterials(scope, listener),
      [scope],
    ),
    useCallback(() => getWorkbenchMaterialSnapshot(scope), [scope]),
    () => getWorkbenchMaterialSnapshot(scope),
  );
  const registerAdapter = useCallback((adapter: WorkbenchMaterialAdapter) => {
    adapterRef.current = adapter;
    setAdapterRevision((value) => value + 1);
    return () => {
      if (adapterRef.current === adapter) {
        adapterRef.current = null;
        setAdapterRevision((value) => value + 1);
      }
    };
  }, []);
  const perform = useCallback(
    async (action: WorkbenchMaterialAction, item: LibraryItem) => {
      const adapter = adapterRef.current;
      if (
        !adapter ||
        !adapter.actions.includes(action) ||
        !adapter.accepts(item, action)
      ) {
        return { ok: false, error: "当前编辑器不支持这个素材动作。" };
      }
      try {
        await adapter.mutate(action, cloneMaterialForWorkbench(item));
        return { ok: true };
      } catch (caught) {
        return {
          ok: false,
          error: caught instanceof Error ? caught.message : "素材应用失败。",
        };
      }
    },
    [],
  );
  const canPerform = useCallback(
    (action: WorkbenchMaterialAction, item: LibraryItem) => {
      const adapter = adapterRef.current;
      return Boolean(
        adapter &&
          adapter.actions.includes(action) &&
          adapter.accepts(item, action),
      );
    },
    [],
  );
  const value = useMemo<WorkbenchMaterialContextValue>(
    () => ({
      siteId,
      appId,
      scope,
      entries,
      actions: adapterRef.current?.actions || [],
      registerAdapter,
      canPerform,
      perform,
    }),
    [
      adapterRevision,
      appId,
      canPerform,
      entries,
      perform,
      registerAdapter,
      scope,
      siteId,
    ],
  );
  return (
    <WorkbenchMaterialContext.Provider value={value}>
      {children}
    </WorkbenchMaterialContext.Provider>
  );
}

export function useWorkbenchMaterials(): WorkbenchMaterialContextValue | null {
  return useContext(WorkbenchMaterialContext);
}

export function useWorkbenchMaterialAdapter(
  adapter: WorkbenchMaterialAdapter | null,
): void {
  const context = useWorkbenchMaterials();
  const register = context?.registerAdapter;
  useEffect(() => {
    if (!register || !adapter) return;
    return register(adapter);
  }, [adapter, register]);
}
