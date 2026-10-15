"use client";

import { useEffect, useRef, useState } from "react";
import type { BayPaneProps } from "../shell/bay-state";
import type { MineCategory } from "./mine-category";

export type MinePaneProps = BayPaneProps & { category?: MineCategory };

export function useMineBundle<T>(signedIn: boolean, loader: () => Promise<T>, fallbackError: string): {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
} {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(signedIn));
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    void loaderRef.current().then(
      (value) => {
        if (!alive) return;
        setData(value);
        setLoading(false);
      },
      (reason: unknown) => {
        if (!alive) return;
        setError(reason instanceof Error && reason.message ? reason.message : fallbackError);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [signedIn, nonce, fallbackError]);

  return { data, loading, error, reload: () => setNonce((value) => value + 1) };
}
