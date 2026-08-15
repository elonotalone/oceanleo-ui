"use client";

import { useEffect, useState } from "react";

import {
  cancelLocalTask,
  watchLocalTask,
  type LocalTask,
  type LocalTaskDenyReason,
  type LocalTaskResultSummary,
  type LocalTaskStatus,
} from "./local-task-client";

export interface LocalTaskProgressProps {
  taskId: string;
  deviceName?: string;
  initialTask?: LocalTask;
  onUpdate?: (task: LocalTask) => void;
  className?: string;
}

const STATUS_COPY: Record<LocalTaskStatus, string> = {
  queued: "任务已排队，正在等待设备领取。",
  claimed: "设备已领取任务，正在准备执行。",
  running: "正在那台电脑上执行。",
  succeeded: "这一步已在那台电脑上完成。",
  failed: "这一步执行失败，请在那台电脑上检查后重试。",
  denied: "那台电脑拒绝了这一步。",
  expired: "等待超过 24 小时，任务已过期；请确认那台电脑在线后重新发起。",
  cancelled: "这一步已取消，不会继续在那台电脑上执行。",
};

export function localTaskDeniedMessage(
  reason: LocalTaskDenyReason | undefined,
  deviceName: string,
): string {
  switch (reason) {
    case "local_exec_disabled":
      return `${deviceName}还没允许云端下发。这个开关只能在那台电脑上打开（托盘图标里）。`;
    case "grant_missing":
      return `${deviceName}还没授权这类操作。需要在那台电脑上授权后重新发起。`;
    case "path_outside_grant":
      return `这个路径不在${deviceName}已授权的目录范围内。请在那台电脑上选择已授权目录，或由电脑前的人调整授权。`;
    case "confirm_timeout":
      return `${deviceName}上没有人在 90 秒内确认，这一步已取消。请回到那台电脑上重新发起。`;
    case "revoked":
      return `${deviceName}已被撤销，需要在那台电脑上重新配对。`;
    default:
      return `${deviceName}拒绝了这一步。请到那台电脑上查看本地审计记录。`;
  }
}

function Summary({ summary }: { summary: LocalTaskResultSummary }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3" data-local-task-summary>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {summary.entries !== undefined ? (
          <><dt>条目数</dt><dd>{summary.entries}</dd></>
        ) : null}
        {summary.bytes !== undefined ? (
          <><dt>字节数</dt><dd>{summary.bytes}</dd></>
        ) : null}
        {summary.rows !== undefined ? (
          <><dt>行数</dt><dd>{summary.rows}</dd></>
        ) : null}
        {summary.columns ? (
          <><dt>列</dt><dd>{summary.columns.join("、") || "无"}</dd></>
        ) : null}
        {summary.exit_code !== undefined ? (
          <><dt>退出码</dt><dd>{summary.exit_code}</dd></>
        ) : null}
      </dl>
      {summary.files ? (
        <ul className="mt-2 space-y-1 text-sm" aria-label="文件结构摘要">
          {summary.files.map((file, index) => (
            <li key={`${file.name}:${index}`}>
              {file.name} · {file.kind} · {file.bytes} 字节
            </li>
          ))}
        </ul>
      ) : null}
      {summary.stdout_tail ? (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs" aria-label="程序标准输出">
          {summary.stdout_tail}
        </pre>
      ) : null}
      {summary.stderr_tail ? (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-red-700" aria-label="程序错误输出">
          {summary.stderr_tail}
        </pre>
      ) : null}
    </div>
  );
}

export function LocalTaskProgress({
  taskId,
  deviceName = "这台电脑",
  initialTask,
  onUpdate,
  className,
}: LocalTaskProgressProps) {
  const [task, setTask] = useState<LocalTask | undefined>(initialTask);
  const [watchError, setWatchError] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    setTask(initialTask);
    setWatchError(false);
    return watchLocalTask(
      taskId,
      (next) => {
        setTask(next);
        setWatchError(false);
        onUpdate?.(next);
      },
      { onError: () => setWatchError(true) },
    );
  }, [initialTask, onUpdate, taskId]);

  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    setWatchError(false);
    try {
      await cancelLocalTask(taskId);
      const cancelled: LocalTask = { status: "cancelled" };
      setTask(cancelled);
      onUpdate?.(cancelled);
    } catch {
      setWatchError(true);
    } finally {
      setCancelling(false);
    }
  };

  if (!task) {
    return (
      <div className={className} role="status" data-local-task-status="loading">
        正在读取本机任务进度…
      </div>
    );
  }

  const canCancel = task.status === "queued" || task.status === "claimed";
  const statusMessage =
    task.status === "denied"
      ? localTaskDeniedMessage(task.denyReason, deviceName)
      : task.status === "queued"
        ? `${deviceName}领取前，任务会安全地留在队列里。`
        : STATUS_COPY[task.status];

  return (
    <section className={className} data-local-task-status={task.status} aria-live="polite">
      <p>{statusMessage}</p>
      {task.status === "queued" ? (
        <p className="mt-1 text-sm text-slate-600">
          如果{deviceName}离线，它上线后这一步会自动继续。
        </p>
      ) : null}
      {task.resultSummary ? <Summary summary={task.resultSummary} /> : null}
      {canCancel ? (
        <button
          type="button"
          onClick={() => void cancel()}
          disabled={cancelling}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          {cancelling ? "正在取消…" : "取消这一步"}
        </button>
      ) : null}
      {watchError ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          暂时读不到进度，请检查网络；任务状态不会因此改变。
        </p>
      ) : null}
    </section>
  );
}
