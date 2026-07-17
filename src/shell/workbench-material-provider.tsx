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
export const WORKBENCH_MATERIAL_MIME =
  "application/x-oceanleo-material+json" as const;

export interface WorkbenchMaterialPlacement {
  source: "click" | "drop";
  clientX?: number;
  clientY?: number;
}

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
    placement?: WorkbenchMaterialPlacement,
  ) => Promise<{ ok: boolean; error?: string }>;
  draggedItem: LibraryItem | null;
  beginMaterialDrag: (item: LibraryItem) => void;
  endMaterialDrag: () => void;
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
  const [draggedItem, setDraggedItem] = useState<LibraryItem | null>(null);
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
    async (
      action: WorkbenchMaterialAction,
      item: LibraryItem,
      placement?: WorkbenchMaterialPlacement,
    ) => {
      const adapter = adapterRef.current;
      if (
        !adapter ||
        !adapter.actions.includes(action) ||
        !adapter.accepts(item, action)
      ) {
        return { ok: false, error: "当前编辑器不支持这个素材动作。" };
      }
      try {
        await adapter.mutate(
          action,
          cloneMaterialForWorkbench(item),
          placement,
        );
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
  const beginMaterialDrag = useCallback((item: LibraryItem) => {
    setDraggedItem(cloneMaterialForWorkbench(item));
  }, []);
  const endMaterialDrag = useCallback(() => {
    setDraggedItem(null);
  }, []);
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
      draggedItem,
      beginMaterialDrag,
      endMaterialDrag,
    }),
    [
      adapterRevision,
      appId,
      canPerform,
      beginMaterialDrag,
      draggedItem,
      endMaterialDrag,
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
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const adapterId = adapter?.id || "";
  const actionsKey = adapter?.actions.join("|") || "";
  useEffect(() => {
    if (!register || !adapterId) return;
    const current = adapterRef.current;
    if (!current) return;
    // Register a stable proxy. Route calculation may return a fresh adapter
    // object on every host render; registering that identity directly made the
    // provider update itself forever and left the embedded editor blank.
    return register({
      id: adapterId,
      actions: current.actions,
      accepts: (item, action) =>
        adapterRef.current?.accepts(item, action) || false,
      mutate: (action, item, placement) => {
        const active = adapterRef.current;
        if (!active) throw new Error("当前编辑器已经关闭。");
        return active.mutate(action, item, placement);
      },
    });
  }, [actionsKey, adapterId, register]);
}
