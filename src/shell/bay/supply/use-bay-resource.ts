"use client";

// 按 key 归属的一次取数：key 一变，上一份结果立刻算过期（先出加载态，不把上一个服务的价格摆在新服务上）。
// 卸载或换 key 时丢弃迟到的响应。

import { useCallback, useEffect, useState } from "react";

export interface BayResource<T> {
  data: T | null;
  error: string;
  status: number | null;
  loading: boolean;
  reload: () => void;
}

export function errorStatus(error: unknown): number | null {
  const status = error && typeof error === "object" ? (error as { status?: unknown }).status : null;
  return typeof status === "number" ? status : null;
}

export function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "";
}

export function useBayResource<T>(key: string | null, load: () => Promise<T>): BayResource<T> {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; error: string; status: number | null } | null>(null);
  const fullKey = key ? `${key}|${nonce}` : "";

  useEffect(() => {
    if (!fullKey) return;
    let active = true;
    load().then(
      (data) => {
        if (active) setState({ key: fullKey, data, error: "", status: null });
      },
      (error: unknown) => {
        if (active) setState({ key: fullKey, data: null, error: errorText(error), status: errorStatus(error) });
      },
    );
    return () => {
      active = false;
    };
    // load 跟着 key 走；调用方每次渲染给的新闭包不该触发重取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const fresh = state && state.key === fullKey ? state : null;
  return {
    data: fresh?.data ?? null,
    error: fresh?.error ?? "",
    status: fresh?.status ?? null,
    loading: Boolean(fullKey) && !fresh,
    reload: useCallback(() => setNonce((value) => value + 1), []),
  };
}
