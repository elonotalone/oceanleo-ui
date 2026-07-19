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
import { prepareArtifactForAction } from "./artifact-client";
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
  workbenchMaterialActionAvailability,
  type WorkbenchMaterialAction,
  type WorkbenchMaterialActionAvailability,
  type WorkbenchMaterialAdapter,
  type WorkbenchMaterialPlacement,
} from "./workbench-material-registry";

export type {
  WorkbenchMaterialAction,
  WorkbenchMaterialActionAvailability,
  WorkbenchMaterialAdapter,
  WorkbenchMaterialCommandContract,
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
  availability: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => WorkbenchMaterialActionAvailability;
  perform: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
    placement?: WorkbenchMaterialPlacement,
  ) => Promise<{ ok: boolean; error?: string }>;
  draggedItem: LibraryItem | null;
  beginMaterialDrag: (item: LibraryItem) => void;
  endMaterialDrag: () => void;
}

export type WorkbenchMaterialRuntimeValue = Omit<
  WorkbenchMaterialContextValue,
  "entries" | "registerAdapter"
>;

const WorkbenchMaterialContext =
  createContext<WorkbenchMaterialContextValue | null>(null);

function useWorkbenchMaterialRuntimeScope(
  siteId: string,
  appId: string,
): WorkbenchMaterialRuntimeValue {
  const scope = materialScopeKey(siteId, appId);
  const runtime = useSyncExternalStore(
    useCallback(
      (listener) => subscribeWorkbenchMaterialRuntime(scope, listener),
      [scope],
    ),
    useCallback(() => getWorkbenchMaterialRuntimeSnapshot(scope), [scope]),
    () => getWorkbenchMaterialRuntimeSnapshot(scope),
  );
  const perform = useCallback(
    async (
      action: WorkbenchMaterialAction,
      item: LibraryItem,
      placement?: WorkbenchMaterialPlacement,
    ) => {
      try {
        const prepared =
          action === "insert" || action === "replace"
            ? await prepareArtifactForAction(action, item)
            : { ok: true as const, data: item };
        if (!prepared.ok || !prepared.data) {
          return {
            ok: false,
            error: prepared.error || "素材没有可用的耐久 identity。",
          };
        }
        const availability = workbenchMaterialActionAvailability(
          scope,
          action,
          prepared.data,
        );
        if (!availability.available) {
          return { ok: false, error: availability.reason };
        }
        await performWorkbenchMaterial(
          scope,
          action,
          prepared.data,
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
  const availability = useCallback(
    (action: WorkbenchMaterialAction, item: LibraryItem) =>
      workbenchMaterialActionAvailability(scope, action, item),
    [scope],
  );
  return useMemo<WorkbenchMaterialRuntimeValue>(
    () => ({
      siteId,
      appId,
      scope,
      actions: runtime.actions,
      canPerform,
      availability,
      perform,
      draggedItem: runtime.draggedItem,
      beginMaterialDrag,
      endMaterialDrag,
    }),
    [
      appId,
      availability,
      canPerform,
      beginMaterialDrag,
      endMaterialDrag,
      perform,
      runtime,
      scope,
      siteId,
    ],
  );
}

/**
 * Runtime-only material actions for surfaces that render/register the material
 * entries themselves. Subscribing those owners to the entry snapshot creates a
 * circular external-store dependency: render -> register -> notify -> render.
 */
export function useWorkbenchMaterialActions(
  siteId: string,
  appId: string,
): WorkbenchMaterialRuntimeValue {
  return useWorkbenchMaterialRuntimeScope(siteId, appId);
}

export function useWorkbenchMaterialScope(
  siteId: string,
  appId: string,
): WorkbenchMaterialContextValue {
  const runtime = useWorkbenchMaterialRuntimeScope(siteId, appId);
  const scope = runtime.scope;
  const entries = useSyncExternalStore(
    useCallback(
      (listener) => subscribeWorkbenchMaterials(scope, listener),
      [scope],
    ),
    useCallback(() => getWorkbenchMaterialSnapshot(scope), [scope]),
    () => getWorkbenchMaterialSnapshot(scope),
  );
  const registerAdapter = useCallback(
    (adapter: WorkbenchMaterialAdapter) =>
      registerWorkbenchMaterialAdapter(scope, adapter),
    [scope],
  );
  return useMemo<WorkbenchMaterialContextValue>(
    () => ({
      ...runtime,
      entries,
      registerAdapter,
    }),
    [entries, registerAdapter, runtime],
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
  const commandKey = adapter?.command
    ? `${adapter.command.version}:${adapter.command.history}`
    : "";
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
      ...(current.command
        ? {
            command: {
              version: 1 as const,
              history: "editor-command" as const,
              createCommand: (action, item, placement) => {
                const active = adapterRef.current?.command;
                if (!active) {
                  throw new Error("目标编辑器的 command contract 已卸载。");
                }
                return active.createCommand(action, item, placement);
              },
              execute: (command, item, placement) => {
                const active = adapterRef.current?.command;
                if (!active) {
                  throw new Error("目标编辑器的 command executor 已卸载。");
                }
                return active.execute(command, item, placement);
              },
            },
          }
        : {}),
      accepts: (item, action) =>
        adapterRef.current?.accepts(item, action) || false,
      mutate: (action, item, placement, command) => {
        const active = adapterRef.current;
        if (!active) throw new Error("当前编辑器已经关闭。");
        return active.mutate(action, item, placement, command);
      },
    });
  }, [actionsKey, adapterId, commandKey, register]);
}
