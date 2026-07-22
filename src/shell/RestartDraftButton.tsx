"use client";

// ============================================================================
// @oceanleo/ui — RestartDraftButton：操作台「新建」按钮
// ----------------------------------------------------------------------------
// doctrine 2026-07-09。操作台默认自动恢复上次草稿；当用户想丢弃续编、从头开始时点它。
// 单击即执行：先冲刷最新 snapshot，再归档整份 AppSession，最后 remount 干净 runtime。
// 保存后刷新成干净工作台。工作台已切到 `/history/<sessionId>` 时仍可显式「新建」：
// 旧 session 原地保存，新 session 获得新的唯一 URL。
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "../i18n/ui/useUI";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";
import { historySessionHref } from "./workspace-route";

export interface RestartDraftButtonProps {
  /**
   * Flush the latest operation-console snapshot before archival. Returning
   * false aborts restart so a failed save can never erase visible work.
   */
  onBeforeRestart?: () => boolean | Promise<boolean>;
  /** Host cleanup after the aggregate was archived. */
  onRestart?: () => void | Promise<void>;
  /** 自定义文案（默认「新建」）。 */
  label?: string;
  /** 紧凑 PaneHeader 形态：只显示状态图标，文案通过 aria-label/title 暴露。 */
  iconOnly?: boolean;
  className?: string;
}

export function RestartDraftButton({
  onBeforeRestart,
  onRestart,
  label,
  iconOnly = false,
  className,
}: RestartDraftButtonProps) {
  const tt = useUI();
  const router = useRouter();
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
  const state = busy ? "saving" : feedback ?? "idle";
  const statusLabel =
    state === "saving"
      ? tt("正在保存并新建")
      : state === "saved"
        ? tt("已保存到我的任务")
        : state === "reset"
          ? tt("已刷新")
          : label ?? tt("新建");
  return (
    <button
      type="button"
      data-workbench-action={iconOnly ? "new" : undefined}
      data-state={iconOnly ? state : undefined}
      disabled={busy || feedback !== null}
      aria-busy={busy}
      aria-label={statusLabel}
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
            if (workspace?.mode === "history") {
              const next = await workspace.startNew({
                title: workspace.appTitle,
                snapshot: {},
                schemaVersion: 1,
              });
              if (!next) return;
              await onRestart?.();
              router.replace(historySessionHref(next.id));
              setLocalFeedback("reset");
              timer.current = setTimeout(
                () => setLocalFeedback(null),
                2600,
              );
              return;
            }
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
      title={
        state === "idle"
          ? tt("将当前工作保存到我的任务，并打开一个干净工作台")
          : statusLabel
      }
      className={
        className ??
        `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium transition ${
          feedback
            ? "bg-emerald-50 text-emerald-700"
            : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
        } disabled:opacity-50`
      }
    >
      {iconOnly ? (
        <svg
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${state === "saving" ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          {state === "saving" ? (
            <path
              d="M20 12a8 8 0 1 1-2.35-5.65"
              strokeLinecap="round"
            />
          ) : state === "saved" || state === "reset" ? (
            <path
              d="M5 13l4 4L19 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <>
              <path d="M12 5v14" strokeLinecap="round" />
              <path d="M5 12h14" strokeLinecap="round" />
            </>
          )}
        </svg>
      ) : busy ? (
        tt("正在保存…")
      ) : feedback === "saved" ? (
        tt("已保存到我的任务")
      ) : feedback === "reset" ? (
        tt("已刷新")
      ) : (
        label ?? tt("新建")
      )}
    </button>
  );
}
