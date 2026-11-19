"use client";

import { useAutoRecovery } from "../lib/auto-recovery";
import { useRef } from "react";
import { useUI } from "../i18n/ui/useUI";
import { bayFailureKind } from "./bay/shell/use-bay-auto-retry";

// Some owners unmount the failure surface while re-reading. Retain only the
// backoff counter briefly; resource data and callbacks never enter this cache.
const attempts = new Map<string, { current: number; last: number }>();

/** Read failures keep their loading state until the selected resource recovers. */
export function AutoRecovery({ recover, error, identity }: {
  recover: () => unknown;
  error?: unknown;
  identity?: string;
}) {
  const tt = useUI();
  const code = (error as { code?: string } | null)?.code;
  const kind = code && ["signed_out", "unauthorized", "forbidden", "permission_missing"].includes(code)
    ? "denied" : bayFailureKind(error);
  const saved = useRef<{ identity?: string; counter: { current: number; last: number } } | null>(null);
  if (!saved.current || saved.current.identity !== identity) {
    const previous = identity ? attempts.get(identity) : undefined;
    const counter = previous && Date.now() - previous.last < 120_000 ? previous : { current: 0, last: Date.now() };
    saved.current = { identity, counter };
    if (identity) {
      if (attempts.size >= 100) attempts.delete(attempts.keys().next().value!);
      attempts.set(identity, counter);
    }
  }
  const counter = saved.current.counter;
  useAutoRecovery(kind === "temporary", async () => { counter.last = Date.now(); await recover(); }, identity, counter);
  return <div role="status" aria-busy={kind === "temporary"} data-auto-recovery={kind}>
    {tt(kind === "temporary" ? "正在加载…" : kind === "missing" ? "这项内容不存在或已下架。" : "你没有权限查看这项内容。")}
  </div>;
}
