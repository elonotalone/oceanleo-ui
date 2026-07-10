"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWorkspaceSession } from "./workspace-session-context";

interface RuntimeHydrationValue {
  appInitialized: boolean;
  markAppInitialized: () => void;
  markRuntimeReady: () => void;
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
  const identity = `${workspace.mode}:${workspace.siteId}:${workspace.appId}:${
    workspace.sessionId || "new"
  }:${scope}`;
  const [state, setState] = useState({
    identity,
    appInitialized: false,
    runtimeReady: false,
  });
  const current =
    state.identity === identity
      ? state
      : { identity, appInitialized: false, runtimeReady: false };

  const markAppInitialized = useCallback(() => {
    setState((previous) =>
      previous.identity === identity
        ? { ...previous, appInitialized: true }
        : { identity, appInitialized: true, runtimeReady: false },
    );
  }, [identity]);
  const markRuntimeReady = useCallback(() => {
    setState((previous) =>
      previous.identity === identity
        ? { ...previous, runtimeReady: true }
        : { identity, appInitialized: false, runtimeReady: true },
    );
  }, [identity]);
  const registerBeforeLeave = useCallback(
    (callback: (() => Promise<boolean>) | null) => {
      onRegisterBeforeLeave?.(callback);
    },
    [onRegisterBeforeLeave],
  );
  const value = useMemo<RuntimeHydrationValue>(
    () => ({
      appInitialized: current.appInitialized,
      markAppInitialized,
      markRuntimeReady,
      registerBeforeLeave,
    }),
    [
      current.appInitialized,
      markAppInitialized,
      markRuntimeReady,
      registerBeforeLeave,
    ],
  );
  const ready =
    workspace.availability !== "loading" && current.runtimeReady;

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
            正在恢复上次工作…
          </div>
        )}
      </div>
    </RuntimeHydrationContext.Provider>
  );
}

export function useWorkspaceRuntimeHydration(): RuntimeHydrationValue | null {
  return useContext(RuntimeHydrationContext);
}
