"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cloudComputerApi,
  isMountable,
  readMountedComputerId,
  writeMountedComputerId,
  type CloudComputerClient,
  type Computer,
} from "../../lib/cloud-computer-api";
import {
  canOpenShell,
  isConnectedComputer,
} from "./computer-state";

export { isMountable, canOpenShell, isConnectedComputer };

export const CC_POLL_MS = 15_000;

export function isAliveComputer(computer: Computer): boolean {
  return computer.status !== "released" && computer.status !== "removed";
}

export function isOnlineComputer(computer: Computer): boolean {
  return isAliveComputer(computer) && computer.node_online === true;
}

/**
 * 挂载规则：候选只含已接入机器（`isConnectedComputer`）。
 * 恰一台可开 Shell（ready）→ 自动挂那台；
 * 多台 ready → 上次选择仍 ready 则沿用，否则第一台 ready；
 * 零台 ready 但还有已接入 → 上次选择仍在候选则沿用，否则第一台；
 * 零台已接入 → 未挂载。接入中的行永远不是候选。
 */
export function pickMountedId(
  items: Computer[],
  stored: string | null,
): string | null {
  const connected = items.filter(isConnectedComputer);
  if (connected.length === 0) return null;
  const ready = connected.filter((item) => canOpenShell(item));
  if (ready.length === 1) return ready[0].id;
  if (ready.length > 1) {
    if (stored && ready.some((item) => item.id === stored)) return stored;
    return ready[0].id;
  }
  if (stored && connected.some((item) => item.id === stored)) return stored;
  return connected[0].id;
}

export function newShellEnabled(computer: Computer | null | undefined): boolean {
  return canOpenShell(computer);
}

export function useCloudComputers(options?: {
  client?: CloudComputerClient;
  computers?: Computer[];
  pollMs?: number;
}) {
  const client = options?.client ?? cloudComputerApi;
  const pollMs = options?.pollMs ?? CC_POLL_MS;
  const [computers, setComputers] = useState<Computer[]>(
    options?.computers ?? [],
  );
  const [mountedId, setMountedIdState] = useState<string | null>(null);
  const [rememberedId, setRememberedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!options?.computers);
  const [error, setError] = useState<string | null>(null);
  const computersRef = useRef(computers);
  computersRef.current = computers;

  const applyList = useCallback((items: Computer[]) => {
    setComputers(items);
    const next = pickMountedId(items, readMountedComputerId() || null);
    setMountedIdState(next);
    writeMountedComputerId(next);
  }, []);

  const refresh = useCallback(async () => {
    if (options?.computers) {
      applyList(options.computers);
      setLoading(false);
      return;
    }
    try {
      const data = await client.listComputers();
      setError(null);
      applyList(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [applyList, client, options?.computers]);

  useEffect(() => {
    setRememberedId(readMountedComputerId() || null);
  }, []);

  useEffect(() => {
    if (options?.computers) {
      applyList(options.computers);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    client
      .listComputers()
      .then((data) => {
        if (cancelled) return;
        setError(null);
        applyList(data.items || []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyList, client, options?.computers]);

  useEffect(() => {
    if (options?.computers) return;
    if (typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(tick, pollMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [options?.computers, pollMs, refresh]);

  const setMountedId = useCallback((id: string | null) => {
    setMountedIdState(id);
    writeMountedComputerId(id);
  }, []);

  const mounted =
    computers.find((item) => item.id === mountedId) ?? null;

  return {
    computers,
    mounted,
    mountedId,
    rememberedId,
    setMountedId,
    loading,
    error,
    refresh,
  };
}
