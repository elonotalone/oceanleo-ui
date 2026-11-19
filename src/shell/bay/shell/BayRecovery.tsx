"use client";

import { useUI } from "../../../i18n/ui/useUI";
import { bayFailureKind, useBayAutoRetry } from "./use-bay-auto-retry";

export function BayRecovery({ reload, error, scope, terminalText }: { reload: () => unknown; error?: unknown; scope: string; terminalText?: string }) {
  const tt = useUI();
  const kind = bayFailureKind(error);
  useBayAutoRetry(kind === "temporary", reload, scope);
  return <div role="status" data-bay-recovery={kind} aria-busy={kind === "temporary"} className="space-y-3 p-4 text-sm text-neutral-500">
    {kind === "temporary" ? <><div className="h-5 w-2/3 animate-pulse rounded bg-neutral-100" /><p>{tt("正在加载…")}</p></>
      : <p>{terminalText || tt(kind === "missing" ? "这项内容不存在或已下架。" : "你没有权限查看这项内容。")}</p>}
  </div>;
}
