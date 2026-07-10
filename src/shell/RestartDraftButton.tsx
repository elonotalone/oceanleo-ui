"use client";

// ============================================================================
// @oceanleo/ui — RestartDraftButton：操作台「重新开始」小按钮（单一事实源）
// ----------------------------------------------------------------------------
// doctrine 2026-07-09。操作台默认自动恢复上次草稿；当用户想丢弃续编、从头开始时点它。
// 单击即执行：先冲刷最新 snapshot，再归档整份 AppSession，最后 remount 干净 runtime。
// 归档成功后明确显示「已保存至历史记录」，不再用「确认清空？」制造数据会丢失的错觉。
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
  const [busy, setBusy] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<
    "saved" | "reset" | null
  >(
    null,
  );
  const feedback = workspace?.restartFeedback ?? localFeedback;
  const inFlightRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <button
      type="button"
      disabled={busy || feedback !== null}
      onClick={() => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        if (timer.current) clearTimeout(timer.current);
        setBusy(true);
        void (async () => {
          try {
            const flushed = await onBeforeRestart?.();
            if (flushed === false) return;
            // 先归档聚合会话，成功后才清宿主 state/旧草稿；这样“重新开始”一定会
            // 建立新 session，而不是把旧历史的 snapshot 覆盖成空白。
            const restartResult = workspace
              ? await workspace.restart()
              : "empty";
            if (!restartResult) return;
            await onRestart?.();
            // 历史页的 URL 指向刚归档的旧会话。重置完成后回到同一 app 的 live
            // canonical URL，否则用户继续输入虽会建立新 session，刷新却又会打开旧历史。
            if (workspace?.mode === "history") {
              const query = searchParams.get("embed") === "1" ? "?embed=1" : "";
              router.replace(`${workspaceAppHref(workspace.appId)}${query}`);
            }
            // Workspace feedback lives in the provider so it survives the
            // keyed runtime remount. Standalone consumers keep a local reset
            // notice because they have no aggregate session to archive.
            if (!workspace) {
              setLocalFeedback("reset");
              timer.current = setTimeout(
                () => setLocalFeedback(null),
                2600,
              );
            }
          } finally {
            inFlightRef.current = false;
            setBusy(false);
          }
        })();
      }}
      title={tt("保存当前工作至历史记录并重新开始")}
      className={
        className ??
        `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium transition ${
          feedback
            ? "bg-emerald-50 text-emerald-700"
            : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
        } disabled:opacity-50`
      }
    >
      {busy
        ? tt("正在保存…")
        : feedback === "saved"
          ? tt("已保存至历史记录")
          : feedback === "reset"
            ? tt("已重新开始")
            : label ?? tt("重新开始")}
    </button>
  );
}
