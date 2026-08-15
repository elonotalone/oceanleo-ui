"use client";

import { useState } from "react";

import {
  createLocalTask,
  LocalTaskApiError,
  type CreatedLocalTask,
  type LocalActionKind,
  type LocalActionPayloadByKind,
} from "./local-task-client";

export interface LocalTaskLauncherProps<K extends LocalActionKind = LocalActionKind> {
  deviceId: string | null | undefined;
  deviceName?: string;
  deviceOnline?: boolean;
  actionKind: K;
  payload: LocalActionPayloadByKind[NoInfer<K>];
  label: string;
  onCreated: (task: CreatedLocalTask) => void;
  devicesHref?: string;
  className?: string;
}

function launcherErrorMessage(error: unknown, deviceName: string): string {
  const code = error instanceof LocalTaskApiError ? error.code : "network_error";
  switch (code) {
    case "revoked":
      return `${deviceName}已被撤销，请先重新配对。`;
    case "action_kind_unknown":
      return "这个本机操作暂不受支持，请刷新页面后再试。";
    case "unauthorized":
      return "登录后才能给你的电脑下发任务。";
    default:
      return "任务暂时没有排上，请检查网络后重试。";
  }
}

export function LocalTaskLauncher<K extends LocalActionKind>({
  deviceId,
  deviceName = "这台电脑",
  deviceOnline = true,
  actionKind,
  payload,
  label,
  onCreated,
  devicesHref = "/devices",
  className,
}: LocalTaskLauncherProps<K>) {
  const [submitting, setSubmitting] = useState(false);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [error, setError] = useState("");

  if (!deviceId) {
    return (
      <div className={className} data-local-task-device-state="missing">
        <a
          href={devicesHref}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          去连接一台电脑
        </a>
      </div>
    );
  }

  const launch = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const created = await createLocalTask(deviceId, actionKind, payload);
      setQueuedOffline(created.offline || !deviceOnline);
      onCreated(created);
    } catch (caught) {
      setError(launcherErrorMessage(caught, deviceName));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={className}
      data-local-task-device-state={deviceOnline ? "online" : "offline"}
    >
      <button
        type="button"
        onClick={() => void launch()}
        disabled={submitting}
        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? "正在排队…" : label}
      </button>
      {actionKind === "shell.run" ? (
        <p className="mt-2 text-sm text-amber-700" data-shell-confirmation-notice>
          命令执行每次都要在{deviceName}上单独确认，不能一次授权长期生效。
        </p>
      ) : null}
      {!deviceOnline && !queuedOffline ? (
        <p className="mt-2 text-sm text-amber-700" role="status">
          {deviceName}现在离线。点下后任务会排队；它上线后这一步会自动继续。
        </p>
      ) : null}
      {queuedOffline ? (
        <p className="mt-2 text-sm text-amber-700" role="status">
          任务已排队，等{deviceName}上线后这一步会自动继续。
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
