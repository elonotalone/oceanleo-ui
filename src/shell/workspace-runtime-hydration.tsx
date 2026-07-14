"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorkspaceSession } from "./workspace-session-context";
import {
  normalizeWorkspaceUiSnapshot,
  type WorkspaceUiSnapshot,
} from "./workspace-session-snapshot";

export interface RuntimeHydrationValue {
  identity: string;
  appInitialized: boolean;
  /** True when this runtime was opened from any persisted session snapshot. */
  restoredSnapshot: boolean;
  /** Shared right-pane selection restored from __oceanleo_ui, when present. */
  rightTab: string | null;
  /** App-scoped optional operator note restored from __oceanleo_ui. */
  operatorRemark: string;
  /** Increments once for every persisted snapshot injected into the runtime. */
  snapshotRestoreEpoch: number;
  /** Read shared metadata at save time, including a non-mutating default tab. */
  snapshotSharedUi: () => WorkspaceUiSnapshot;
  markAppInitialized: () => void;
  markRuntimeReady: () => void;
  restoreSharedUi: (ui: WorkspaceUiSnapshot) => void;
  setRightTab: (tabId: string | null) => void;
  setDefaultRightTab: (tabId: string | null) => void;
  setOperatorRemark: (remark: string) => void;
  registerBeforeLeave: (
    callback: (() => Promise<boolean>) | null,
  ) => void;
}

const RuntimeHydrationContext =
  createContext<RuntimeHydrationValue | null>(null);

/**
 * Coordinates the site-owned app reset with the shared session rehydrate.
 *
 * The live runtime stays mounted so its effects can run, but remains invisible
 * until CatalogOps has initialized the selected app and FunctionAgentChat has
 * restored that app's persisted snapshot. This prevents a previous app,
 * initial preset, or first catalog entry from painting for one frame.
 */
export function WorkspaceRuntimeBoundary({
  children,
  scope,
  onRegisterBeforeLeave,
}: {
  children: ReactNode;
  scope: string;
  onRegisterBeforeLeave?: (
    callback: (() => Promise<boolean>) | null,
  ) => void;
}) {
  const workspace = useWorkspaceSession();
  // A live session resolving from the temporary "new" state to its persisted
  // server id is data hydration, not a new app runtime. Including sessionId
  // here cleared appInitialized after CatalogOps' one-shot effect had run,
  // leaving FunctionAgentChat permanently blocked behind the restore screen.
  // History/session switches already remount their keyed provider subtree.
  const identity = `${workspace.mode}:${workspace.siteId}:${workspace.appId}:${scope}`;
  const [state, setState] = useState({
    identity,
    appInitialized: false,
    runtimeReady: false,
    restoredSnapshot: false,
    rightTab: null as string | null,
    operatorRemark: "",
    snapshotRestoreEpoch: 0,
  });
  const defaultRightTabRef = useRef<{
    identity: string;
    tabId: string | null;
  }>({ identity, tabId: null });
  const rightTabRef = useRef<{
    identity: string;
    tabId: string | null;
  }>({ identity, tabId: null });
  const operatorRemarkRef = useRef<{
    identity: string;
    value: string;
  }>({ identity, value: "" });
  const current =
    state.identity === identity
      ? state
      : {
          identity,
          appInitialized: false,
          runtimeReady: false,
          restoredSnapshot: false,
          rightTab: null,
          operatorRemark: "",
          snapshotRestoreEpoch: 0,
        };

  const markAppInitialized = useCallback(() => {
    setState((previous) =>
      previous.identity === identity
        ? { ...previous, appInitialized: true }
        : {
            identity,
            appInitialized: true,
            runtimeReady: false,
            restoredSnapshot: false,
            rightTab: null,
            operatorRemark: "",
            snapshotRestoreEpoch: 0,
          },
    );
  }, [identity]);
  const markRuntimeReady = useCallback(() => {
    setState((previous) =>
      previous.identity === identity
        ? { ...previous, runtimeReady: true }
        : {
            identity,
            appInitialized: false,
            runtimeReady: true,
            restoredSnapshot: false,
            rightTab: null,
            operatorRemark: "",
            snapshotRestoreEpoch: 0,
          },
    );
  }, [identity]);
  const restoreSharedUi = useCallback(
    (ui: WorkspaceUiSnapshot) => {
      const normalized = normalizeWorkspaceUiSnapshot(ui);
      const rightTab = normalized.right_tab ?? null;
      const operatorRemark = normalized.operator_remark ?? "";
      rightTabRef.current = { identity, tabId: rightTab };
      operatorRemarkRef.current = { identity, value: operatorRemark };
      setState((previous) =>
        previous.identity === identity
          ? {
              ...previous,
              restoredSnapshot: true,
              rightTab,
              operatorRemark,
              snapshotRestoreEpoch: previous.snapshotRestoreEpoch + 1,
            }
          : {
              identity,
              appInitialized: false,
              runtimeReady: false,
              restoredSnapshot: true,
              rightTab,
              operatorRemark,
              snapshotRestoreEpoch: 1,
            },
      );
    },
    [identity],
  );
  const setRightTab = useCallback(
    (tabId: string | null) => {
      const rightTab =
        typeof tabId === "string" && tabId.length <= 160 ? tabId : null;
      // Update synchronously so pagehide/Restart in the same browser task reads
      // the tab the user just selected even before React commits its state.
      rightTabRef.current = { identity, tabId: rightTab };
      setState((previous) =>
        previous.identity === identity
          ? { ...previous, rightTab }
          : {
              identity,
              appInitialized: false,
              runtimeReady: false,
              restoredSnapshot: false,
              rightTab,
              operatorRemark: "",
              snapshotRestoreEpoch: 0,
            },
      );
    },
    [identity],
  );
  const setDefaultRightTab = useCallback(
    (tabId: string | null) => {
      defaultRightTabRef.current = {
        identity,
        tabId:
          typeof tabId === "string" && tabId.length <= 160
            ? tabId
            : null,
      };
    },
    [identity],
  );
  const setOperatorRemark = useCallback(
    (raw: string) => {
      const operatorRemark =
        typeof raw === "string" ? raw.slice(0, 4000) : "";
      operatorRemarkRef.current = { identity, value: operatorRemark };
      setState((previous) =>
        previous.identity === identity
          ? { ...previous, operatorRemark }
          : {
              identity,
              appInitialized: false,
              runtimeReady: false,
              restoredSnapshot: false,
              rightTab: null,
              operatorRemark,
              snapshotRestoreEpoch: 0,
            },
      );
    },
    [identity],
  );
  const snapshotSharedUi = useCallback((): WorkspaceUiSnapshot => {
    const explicitTab =
      rightTabRef.current.identity === identity
        ? rightTabRef.current.tabId
        : null;
    const defaultTab =
      defaultRightTabRef.current.identity === identity
        ? defaultRightTabRef.current.tabId
        : null;
    const rightTab = explicitTab || defaultTab;
    const operatorRemark =
      operatorRemarkRef.current.identity === identity
        ? operatorRemarkRef.current.value
        : "";
    return {
      ...(rightTab ? { right_tab: rightTab } : {}),
      ...(operatorRemark.trim() ? { operator_remark: operatorRemark } : {}),
    };
  }, [identity]);
  const registerBeforeLeave = useCallback(
    (callback: (() => Promise<boolean>) | null) => {
      onRegisterBeforeLeave?.(callback);
    },
    [onRegisterBeforeLeave],
  );
  useEffect(() => {
    if (workspace.availability === "loading") return;
    // App-owned hydration is best-effort. A broken child effect used to keep
    // the whole workspace invisible forever even though its controls had
    // already mounted. Reveal the runtime after a bounded grace period.
    const timer = window.setTimeout(() => {
      setState((previous) =>
        previous.identity === identity
          ? {
              ...previous,
              appInitialized: true,
              runtimeReady: true,
            }
          : previous,
      );
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [identity, workspace.availability]);
  const value = useMemo<RuntimeHydrationValue>(
    () => ({
      identity: current.identity,
      appInitialized: current.appInitialized,
      restoredSnapshot: current.restoredSnapshot,
      rightTab: current.rightTab,
      operatorRemark: current.operatorRemark,
      snapshotRestoreEpoch: current.snapshotRestoreEpoch,
      snapshotSharedUi,
      markAppInitialized,
      markRuntimeReady,
      restoreSharedUi,
      setRightTab,
      setDefaultRightTab,
      setOperatorRemark,
      registerBeforeLeave,
    }),
    [
      current.identity,
      current.appInitialized,
      current.restoredSnapshot,
      current.rightTab,
      current.operatorRemark,
      current.snapshotRestoreEpoch,
      snapshotSharedUi,
      markAppInitialized,
      markRuntimeReady,
      restoreSharedUi,
      setRightTab,
      setDefaultRightTab,
      setOperatorRemark,
      registerBeforeLeave,
    ],
  );
  const ready =
    workspace.availability !== "loading" &&
    current.appInitialized &&
    current.runtimeReady;

  return (
    <RuntimeHydrationContext.Provider value={value}>
      <div
        className="relative h-full min-h-[420px]"
        aria-busy={!ready}
        data-workspace-runtime-ready={ready ? "true" : "false"}
      >
        <div className={ready ? "h-full" : "invisible h-full"}>
          {children}
        </div>
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-stone-50/60 text-[13px] text-stone-400">
            加载中…
          </div>
        )}
      </div>
    </RuntimeHydrationContext.Provider>
  );
}

export function useWorkspaceRuntimeHydration(): RuntimeHydrationValue | null {
  return useContext(RuntimeHydrationContext);
}
