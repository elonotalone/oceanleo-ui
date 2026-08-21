"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { deviceErrorCopy } from "../api/device-error-copy";
import {
  LocalTaskApiError,
  cancelLocalTask,
  localCancelArrivedTooLateNote,
  localTaskCanBeCancelled,
  watchLocalTask,
  type LocalTask,
  type LocalActionKind,
  type LocalTaskDenyReason,
  type LocalTaskResultSummary,
  type LocalTaskStatus,
} from "./local-task-client";

export interface LocalTaskProgressProps {
  taskId: string;
  deviceName?: string;
  actionKind?: LocalActionKind;
  initialTask?: LocalTask;
  onUpdate?: (task: LocalTask) => void;
  className?: string;
}

const STATUS_COPY: Record<LocalTaskStatus, string> = {
  queued: "任务已排队，正在等待设备领取。",
  claimed: "设备已领取任务，正在准备执行。",
  running: "正在那台电脑上执行。",
  canceling: "已把「中止」发给那台电脑，正在等它回话。",
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
  if (reason === undefined) {
    return `${deviceName}拒绝了这一步。请到那台电脑上查看本地审计记录。`;
  }
  return deviceErrorCopy(reason, { deviceName });
}

/** Contract §2: a read summary must say whether it read a file or a folder. */
function summaryKindLabel(kind: string): string {
  if (kind === "file") return "文件";
  if (kind === "directory") return "文件夹";
  return kind;
}

function Summary({
  summary,
  actionKind,
  deviceName,
}: {
  summary: LocalTaskResultSummary;
  actionKind?: LocalActionKind;
  deviceName: string;
}) {
  if (actionKind === "shell.run") {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 p-3" data-local-task-summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {summary.exit_code !== undefined ? (
            <><dt>退出码</dt><dd>{summary.exit_code}</dd></>
          ) : null}
          {summary.output_bytes !== undefined ? (
            <><dt>输出</dt><dd>{summary.output_bytes} 字节</dd></>
          ) : null}
        </dl>
        <p className="mt-2 text-sm text-slate-600">
          命令输出只保存在{deviceName}上，可以在客户端的本地审计里查看。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3" data-local-task-summary>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {summary.kind !== undefined ? (
          <><dt>类型</dt><dd data-summary-kind={summary.kind}>{summaryKindLabel(summary.kind)}</dd></>
        ) : null}
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
  actionKind,
  initialTask,
  onUpdate,
  className,
}: LocalTaskProgressProps) {
  const [task, setTask] = useState<LocalTask | undefined>(initialTask);
  const [watchError, setWatchError] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [sendingCancel, setSendingCancel] = useState(false);

  // 宿主（动作台）每轮询一次就换一个 `initialTask` 对象，也常常传一个匿名
  // `onUpdate`。把它们放进依赖表会让轮询在每次父级重渲染时重订阅，并且用父级
  // **更旧**的那份快照把本地刚拿到的 `canceling` 盖回去 —— 用户会看到中止按钮
  // 按下去又弹回来。所以只有 `taskId` 换了才重来，其余走 ref。
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const initialTaskRef = useRef(initialTask);
  initialTaskRef.current = initialTask;

  // 状态只往前叠，不往回洗：任务的字段（动作类别、结果摘要、审计指纹）在协议里
  // 只会从无到有，所以一次只带三个字段的答复不该把台账那一行清空。宿主拿到的必须
  // 是叠加后的这一份 —— 交出去半份，用户点一下中止就丢了那条记录的审计指纹。
  const taskRef = useRef(initialTask);
  const acceptTask = useCallback((next: LocalTask) => {
    const merged = { ...taskRef.current, ...next };
    taskRef.current = merged;
    setTask(merged);
    onUpdateRef.current?.(merged);
  }, []);

  useEffect(() => {
    taskRef.current = initialTaskRef.current;
    setTask(initialTaskRef.current);
    setWatchError(false);
    setCancelError("");
    return watchLocalTask(
      taskId,
      (next) => {
        setWatchError(false);
        acceptTask(next);
      },
      { onError: () => setWatchError(true) },
    );
  }, [acceptTask, taskId]);

  /**
   * A-24：以前这里不问网关答什么，直接把状态写成 `cancelled`。对一条已经在那台
   * 电脑上跑的命令，那句「已取消」是假的 —— 命令会一直跑到自己结束。
   * 现在按网关的真实答复走：没被领走的是真停了，已经在跑的只能是「已请求中止」。
   */
  const cancel = useCallback(async () => {
    if (sendingCancel) return;
    setSendingCancel(true);
    setCancelError("");
    try {
      acceptTask(await cancelLocalTask(taskId));
    } catch (caught) {
      const code = caught instanceof LocalTaskApiError ? caught.code : "network_error";
      setCancelError(
        // 网关对一条已经结束的任务回 409 `illegal_transition`。那不是「读不到」，
        // 是**中止来晚了**：活已经做完，说错这一句用户会以为它没做过。
        code === "illegal_transition"
          ? "中止没赶上：这一步在请求送到之前就已经结束了，下面的结果就是它真正的结局。"
          : "中止没有发出去，请检查网络后重试。这一步的状态没有因此改变。",
      );
    } finally {
      setSendingCancel(false);
    }
  }, [acceptTask, sendingCancel, taskId]);

  if (!task) {
    return (
      <div className={className} role="status" data-local-task-status="loading">
        正在读取本机任务进度…
      </div>
    );
  }

  // 表在 `local-task-client.ts`，逐字对着网关的 cancel 分支。这里不许另写一份
  // 状态名单：按钮亮在网关不受理的状态上，就是「点亮而后端不认」。
  const canCancel = localTaskCanBeCancelled(task.status);
  const cancelRequested = task.status === "canceling";
  const tooLateNote = localCancelArrivedTooLateNote(task, deviceName);
  const effectiveActionKind = task.actionKind ?? actionKind;
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
      {cancelRequested ? (
        <p className="mt-1 text-sm text-slate-600" data-local-task-cancel="requested">
          {deviceName}会在下一个检查点认它：还没动手的会停下并回「已取消」，
          已经动手的会照常做完并如实回报结果。停没停下来只有那台电脑说了算。
        </p>
      ) : null}
      {tooLateNote ? (
        <p className="mt-1 text-sm text-slate-600" data-local-task-cancel="too-late">
          {tooLateNote}
        </p>
      ) : null}
      {task.resultSummary ? (
        <Summary
          summary={task.resultSummary}
          actionKind={effectiveActionKind}
          deviceName={deviceName}
        />
      ) : null}
      {canCancel || cancelRequested ? (
        <button
          type="button"
          onClick={() => void cancel()}
          disabled={sendingCancel || cancelRequested}
          data-local-task-cancel-button={cancelRequested ? "requested" : "available"}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cancelRequested
            ? "已请求中止"
            : sendingCancel
              ? "正在发送中止…"
              : task.status === "queued"
                ? "取消这一步"
                : "中止这一步"}
        </button>
      ) : null}
      {canCancel && task.status !== "queued" ? (
        // 排队中按下去是真停；已经在{deviceName}手上的只能是一句请求。把这两件事
        // 用同一个词说出来，就等于替那台电脑许下一个网页端做不到的承诺。
        <p className="mt-1 text-sm text-slate-600" data-local-task-cancel="requestable">
          这一步已经在{deviceName}手上了，网页端只能把「中止」请求发过去；
          它会在下一个检查点认，认下来才算真的没做。
        </p>
      ) : null}
      {cancelError ? (
        <p className="mt-2 text-sm text-red-700" role="alert" data-local-task-cancel-error>
          {cancelError}
        </p>
      ) : null}
      {watchError ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          暂时读不到进度，请检查网络；任务状态不会因此改变。
        </p>
      ) : null}
    </section>
  );
}
