"use client";

// ============================================================================
// @oceanleo/ui — RestartDraftButton：操作台「重新开始」小按钮（单一事实源）
// ----------------------------------------------------------------------------
// doctrine 2026-07-09。操作台默认自动恢复上次草稿；当用户想丢弃续编、从头开始时点它。
// 二段式确认（先变成「确认清空？」再点一次才真清），避免误触把辛苦填的内容清掉。
// FunctionAgentChat 统一挂载本按钮：先冲刷最新 snapshot，再归档整份 AppSession，最后
// remount 干净 runtime。站点无需各自实现 restart，避免只清表单却丢失 agent thread。
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUI } from "../i18n/ui/useUI";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";
import { workspaceAppHref } from "./workspace-route";

export interface RestartDraftButtonProps {
  /**
   * Flush the latest operation-console snapshot before archival. Returning
   * false aborts restart so a failed save can never erase visible work.
   */
  onBeforeRestart?: () => boolean | Promise<boolean>;
  /** Host cleanup after the aggregate was archived. */
  onRestart?: () => void | Promise<void>;
  /** 自定义文案（默认「重新开始」）。 */
  label?: string;
  className?: string;
}

export function RestartDraftButton({
  onBeforeRestart,
  onRestart,
  label,
  className,
}: RestartDraftButtonProps) {
  const tt = useUI();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useOptionalWorkspaceSession();
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (arming) {
          if (timer.current) clearTimeout(timer.current);
          setArming(false);
          setBusy(true);
          void (async () => {
            try {
              const flushed = await onBeforeRestart?.();
              if (flushed === false) return;
              // 先归档聚合会话，成功后才清宿主 state/旧草稿；这样“重新开始”一定会
              // 建立新 session，而不是把旧历史的 snapshot 覆盖成空白。
              if (workspace) {
                const archived = await workspace.restart();
                if (!archived) return;
              }
              await onRestart?.();
              // 历史页的 URL 指向刚归档的旧会话。重置完成后回到同一 app 的 live
              // canonical URL，否则用户继续输入虽会建立新 session，刷新却又会打开旧历史。
              if (workspace?.mode === "history") {
                const query = searchParams.get("embed") === "1" ? "?embed=1" : "";
                router.replace(`${workspaceAppHref(workspace.appId)}${query}`);
              }
            } finally {
              setBusy(false);
            }
          })();
        } else {
          setArming(true);
          timer.current = setTimeout(() => setArming(false), 2600);
        }
      }}
      title={tt("清空当前草稿，从头开始")}
      className={
        className ??
        `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium transition ${
          arming
            ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
            : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
        } disabled:opacity-50`
      }
    >
      {busy
        ? tt("正在重置…")
        : arming
          ? tt("确认清空？")
          : label ?? tt("重新开始")}
    </button>
  );
}
