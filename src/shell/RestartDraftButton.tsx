"use client";

// ============================================================================
// @oceanleo/ui — RestartDraftButton：操作台「保存并刷新」按钮（单一事实源）
// ----------------------------------------------------------------------------
// doctrine 2026-07-09。操作台默认自动恢复上次草稿；当用户想丢弃续编、从头开始时点它。
// 单击即执行：先冲刷最新 snapshot，再归档整份 AppSession，最后 remount 干净 runtime。
// 2026-07-11：用户名改为「保存并刷新」；成功后进入「我的任务」。任务详情原地续编，
// 不显示本按钮，也绝不再次归档/分叉。
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";

export interface RestartDraftButtonProps {
  /**
   * Flush the latest operation-console snapshot before archival. Returning
   * false aborts restart so a failed save can never erase visible work.
   */
  onBeforeRestart?: () => boolean | Promise<boolean>;
  /** Host cleanup after the aggregate was archived. */
  onRestart?: () => void | Promise<void>;
  /** 自定义文案（默认「保存并刷新」）。 */
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
  // My Tasks is edited in place. Hiding here as well as at the caller prevents
  // a future standalone use from accidentally forking/archiving a saved task.
  if (workspace?.mode === "history") return null;
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
            // 先保存聚合会话，成功后才清宿主 state/旧草稿；这样刷新一定会
            // 建立新 live cache，而刚保存的任务保留在「我的任务」中。
            const restartResult = workspace
              ? await workspace.restart()
              : "empty";
            if (!restartResult) return;
            await onRestart?.();
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
      title={tt("将当前工作保存到我的任务并刷新工作台")}
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
          ? tt("已保存到我的任务")
          : feedback === "reset"
            ? tt("已刷新")
            : label ?? tt("保存并刷新")}
    </button>
  );
}
