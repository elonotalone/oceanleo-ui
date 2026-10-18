"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  COMPUTER_LIST_CACHE_KEY,
  forgetRememberedComputers,
} from "../../lib/cloud-computer-memory";
import {
  cloudComputerApi,
  isMountable,
  readMountedComputerId,
  writeMountedComputerId,
  type CloudComputerClient,
  type Computer,
} from "../../lib/cloud-computer-api";
import * as ccApi from "../../lib/cloud-computer-api";
import {
  canOpenShell,
  isConnectedComputer,
} from "./computer-state";

export { isMountable, canOpenShell, isConnectedComputer };

function rememberMountedComputerName(name: string | null): void {
  const write = ccApi.writeMountedComputerName;
  if (typeof write === "function") write(name);
}

export const CC_POLL_MS = 15_000;
const listCache = new WeakMap<CloudComputerClient, Computer[]>();
const noopSubscribe = () => () => {};
// Deliberately enumerate persisted scalar fields: future API credentials and
// arbitrary nested metadata must never enter sessionStorage.
const CACHE_FIELDS = [
  "id", "name", "source", "status", "edition", "node_online", "created_at", "updated_at",
  "region_id", "zone_id", "instance_id", "instance_type", "image_id", "system_disk_gb",
  "public_ip", "private_ip", "tier_id", "hourly_price_cny", "charge_status", "unpaid_since",
  "last_metered_at", "node_id", "node_version", "node_os", "node_arch", "node_hostname",
  "node_last_seen_at", "node_fingerprint", "node_kernel", "node_cpus", "node_mem_bytes",
  "node_run_as", "node_public_ip", "enrolled_at", "confirmed_at", "host_cert_expires_at", "released_at",
] as const satisfies readonly (keyof Computer)[];

function persistedComputer(item: Computer): Computer {
  return { id: item.id, name: item.name, source: item.source, status: item.status,
    edition: item.edition, node_online: item.node_online, created_at: item.created_at, updated_at: item.updated_at,
    ...Object.fromEntries(CACHE_FIELDS.flatMap((key) => {
    const value = item[key];
    return value === null || ["string", "number", "boolean"].includes(typeof value)
      ? [[key, value]] : [];
  })) };
}

function readListCache(client: CloudComputerClient): Computer[] | undefined {
  if (typeof window === "undefined") return undefined;
  const memory = listCache.get(client);
  if (memory) return memory;
  if (client !== cloudComputerApi) return undefined;
  try {
    const rows: unknown = JSON.parse(window.sessionStorage.getItem(COMPUTER_LIST_CACHE_KEY) || "null");
    if (!Array.isArray(rows) || !rows.every((row) => row && typeof row === "object"
      && ["id", "name", "source", "status", "edition", "created_at", "updated_at"].every((key) => typeof row[key] === "string")
      && typeof row.node_online === "boolean")) return undefined;
    const items = rows.map(persistedComputer);
    listCache.set(client, items);
    return items;
  } catch { return undefined; }
}

function writeListCache(client: CloudComputerClient, items: Computer[]): void {
  if (typeof window === "undefined") return;
  listCache.set(client, items);
  if (client !== cloudComputerApi) return;
  try { window.sessionStorage.setItem(COMPUTER_LIST_CACHE_KEY, JSON.stringify(items.map(persistedComputer))); }
  catch { /* Memory cache still works when browser storage is unavailable. */ }
}

function sameContent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = Object.entries(left), b = Object.entries(right);
  const other = new Map(b);
  return a.length === b.length && a.every(([key, value]) => other.has(key) && sameContent(value, other.get(key)));
}

function reconcileComputers(previous: Computer[], items: Computer[]): Computer[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  const next = items.map((item) => {
    const before = byId.get(item.id);
    return before && sameContent(before, item) ? before : item;
  });
  return next.length === previous.length && next.every((item, index) => item === previous[index]) ? previous : next;
}


/**
 * @deprecated 改用 `computer-state` 的 `isConnectedComputer` / `computerDisplayState`。
 * 正在释放、或节点在线但主人还没确认的机器，这里的结论与全站口径相反。
 */
export function isAliveComputer(computer: Computer): boolean {
  return computer.status !== "released" && computer.status !== "removed";
}

/**
 * @deprecated 改用 `computer-state` 的 `canOpenShell` / `computerDisplayState`。
 * 「节点在线」不等于已接入且可开 Shell。
 */
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

function isSignedOutListError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = "status" in err ? Number((err as { status: unknown }).status) : 0;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  return status === 401 || code === "unauthorized";
}

function forgetList(client: CloudComputerClient): void {
  listCache.delete(client);
  forgetRememberedComputers();
}

export function useCloudComputers(options?: {
  client?: CloudComputerClient;
  computers?: Computer[];
  pollMs?: number;
}) {
  const client = options?.client ?? cloudComputerApi;
  const pollMs = options?.pollMs ?? CC_POLL_MS;
  const clientRender = useSyncExternalStore(noopSubscribe, () => true, () => false);
  // SSR and hydration share props; client-only mounts can show cached data immediately.
  const [initial] = useState(() => options?.computers ?? (clientRender ? readListCache(client) : undefined));
  const initialCacheRef = useRef(options?.computers ? undefined : initial);
  const [computers, setComputers] = useState<Computer[]>(initial ?? []);
  const [mountedId, setMountedIdState] = useState<string | null>(null);
  const [rememberedId, setRememberedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(initial === undefined);
  const [error, setError] = useState<string | null>(null);
  const computersRef = useRef(computers);
  computersRef.current = computers;

  const applyList = useCallback((items: Computer[]) => {
    const stable = reconcileComputers(computersRef.current, items);
    computersRef.current = stable;
    setComputers(stable);
    if (!options?.computers) writeListCache(client, stable);
    const next = pickMountedId(items, readMountedComputerId() || null);
    setMountedIdState(next);
    writeMountedComputerId(next);
    const chosen = next ? items.find((item) => item.id === next) : undefined;
    rememberMountedComputerName(chosen?.name ? chosen.name : null);
  }, [client, options?.computers]);

  // A live 200 from this mount is the only proof the list is ours.
  // A later 401 (token refresh, gateway blip) must not empty the page.
  // First-load 401 still forgets cache so a signed-out tab cannot show
  // the previous person's machines.
  const seenAuthoritativeList = useRef(false);
  const clientRef = useRef(client);
  if (clientRef.current !== client) {
    clientRef.current = client;
    seenAuthoritativeList.current = false;
  }

  const applySuccess = useCallback((items: Computer[]) => {
    seenAuthoritativeList.current = true;
    setError(null);
    applyList(items);
  }, [applyList]);

  const applyFailure = useCallback((err: unknown) => {
    if (isSignedOutListError(err) && !seenAuthoritativeList.current) {
      forgetList(client);
      applyList([]);
      setError(null);
      return;
    }
    setError(err instanceof Error ? err.message : String(err));
  }, [applyList, client]);

  const refresh = useCallback(async () => {
    if (options?.computers) {
      applyList(options.computers);
      setLoading(false);
      return;
    }
    try {
      const data = await client.listComputers();
      applySuccess(data.items || []);
    } catch (err) {
      applyFailure(err);
    } finally {
      setLoading(false);
    }
  }, [applyFailure, applyList, applySuccess, client, options?.computers]);

  useEffect(() => {
    setRememberedId(readMountedComputerId() || null);
  }, []);

  useEffect(() => {
    const cachedAtMount = initialCacheRef.current;
    initialCacheRef.current = undefined;
    if (options?.computers) {
      applyList(options.computers);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cached = cachedAtMount ?? readListCache(client);
    if (cached) applyList(cached);
    setLoading(cached === undefined);
    client
      .listComputers()
      .then((data) => {
        if (cancelled) return;
        applySuccess(data.items || []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        applyFailure(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyFailure, applyList, applySuccess, client, options?.computers]);

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
    if (!id) {
      rememberMountedComputerName(null);
      return;
    }
    const chosen = computersRef.current.find((item) => item.id === id);
    if (chosen) rememberMountedComputerName(chosen.name || null);
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
