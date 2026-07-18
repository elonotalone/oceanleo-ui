"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { LibraryItem } from "./library-data";
import type { WorkspaceLibraryEntry } from "./WorkspaceLibrary";
import {
  beginWorkbenchMaterialDrag,
  canPerformWorkbenchMaterial,
  endWorkbenchMaterialDrag,
  getWorkbenchMaterialRuntimeSnapshot,
  getWorkbenchMaterialSnapshot,
  materialScopeKey,
  performWorkbenchMaterial,
  registerWorkbenchMaterialAdapter,
  subscribeWorkbenchMaterialRuntime,
  subscribeWorkbenchMaterials,
  type WorkbenchMaterialAction,
  type WorkbenchMaterialAdapter,
  type WorkbenchMaterialPlacement,
} from "./workbench-material-registry";

export type {
  WorkbenchMaterialAction,
  WorkbenchMaterialAdapter,
  WorkbenchMaterialPlacement,
} from "./workbench-material-registry";
export const WORKBENCH_MATERIAL_MIME =
  "application/x-oceanleo-material+json" as const;

export interface WorkbenchMaterialContextValue {
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

export function useWorkbenchMaterialScope(
  siteId: string,
  appId: string,
): WorkbenchMaterialContextValue {
  const scope = materialScopeKey(siteId, appId);
  const entries = useSyncExternalStore(
    useCallback(
      (listener) => subscribeWorkbenchMaterials(scope, listener),
      [scope],
    ),
    useCallback(() => getWorkbenchMaterialSnapshot(scope), [scope]),
    () => getWorkbenchMaterialSnapshot(scope),
  );
  const runtime = useSyncExternalStore(
    useCallback(
      (listener) => subscribeWorkbenchMaterialRuntime(scope, listener),
      [scope],
    ),
    useCallback(() => getWorkbenchMaterialRuntimeSnapshot(scope), [scope]),
    () => getWorkbenchMaterialRuntimeSnapshot(scope),
  );
  const registerAdapter = useCallback((adapter: WorkbenchMaterialAdapter) => {
    return registerWorkbenchMaterialAdapter(scope, adapter);
  }, [scope]);
  const perform = useCallback(
    async (
      action: WorkbenchMaterialAction,
      item: LibraryItem,
      placement?: WorkbenchMaterialPlacement,
    ) => {
      if (!canPerformWorkbenchMaterial(scope, action, item)) {
        return { ok: false, error: "当前编辑器不支持这个素材动作。" };
      }
      try {
        await performWorkbenchMaterial(
          scope,
          action,
          item,
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
    [scope],
  );
  const beginMaterialDrag = useCallback((item: LibraryItem) => {
    beginWorkbenchMaterialDrag(scope, item);
  }, [scope]);
  const endMaterialDrag = useCallback(() => {
    endWorkbenchMaterialDrag(scope);
  }, [scope]);
  const canPerform = useCallback(
    (action: WorkbenchMaterialAction, item: LibraryItem) => {
      return canPerformWorkbenchMaterial(scope, action, item);
    },
    [scope],
  );
  return useMemo<WorkbenchMaterialContextValue>(
    () => ({
      siteId,
      appId,
      scope,
      entries,
      actions: runtime.actions,
      registerAdapter,
      canPerform,
      perform,
      draggedItem: runtime.draggedItem,
      beginMaterialDrag,
      endMaterialDrag,
    }),
    [
      appId,
      canPerform,
      beginMaterialDrag,
      endMaterialDrag,
      entries,
      perform,
      registerAdapter,
      runtime,
      scope,
      siteId,
    ],
  );
}

export function WorkbenchMaterialProvider({
  siteId,
  appId,
  children,
}: {
  siteId: string;
  appId: string;
  children: ReactNode;
}) {
  const value = useWorkbenchMaterialScope(siteId, appId);
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
