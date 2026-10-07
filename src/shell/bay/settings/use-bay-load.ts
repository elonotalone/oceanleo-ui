"use client";

// 设置里「钱」「规则与条款」几块共用的取数小钩子：换了依赖或点「重试」就重新取，过期的结果丢掉。
import { useCallback, useEffect, useRef, useState } from "react";

export interface BayLoadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

const LOAD_FAILED = "加载失败，请稍后再试。";

export function useBayLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): BayLoadState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setState((prev) => (prev.loading && !prev.error ? prev : { data: prev.data, error: null, loading: true }));
    loadRef.current().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error && error.message ? error.message : LOAD_FAILED;
        setState((prev) => ({ data: prev.data, error: message, loading: false }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { ...state, reload };
}
