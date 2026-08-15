"use client";

import { useState } from "react";

import {
  deviceErrorCopy,
  isUnsupportedShellCommand,
  SHELL_COMMAND_SHAPE_HINT,
} from "../api/device-error-copy";
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

export function launcherErrorMessage(error: unknown, deviceName: string): string {
  const code = error instanceof LocalTaskApiError ? error.code : "network_error";
  const limit =
    error instanceof LocalTaskApiError && error.limit !== undefined
      ? error.limit
      : undefined;
  switch (code) {
    case "revoked":
      return `${deviceName}已被撤销，请先重新配对。`;
    case "unauthorized":
      return "登录后才能给你的电脑下发任务。";
    // Only a real transport failure may suggest retrying: for quota refusals
    // every retry burns another slot of the hourly budget (contract §1.2).
    case "network_error":
      return "任务暂时没有排上，请检查网络后重试。";
    default:
      return deviceErrorCopy(code, { deviceName, limit });
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

  const shellCommand =
    actionKind === "shell.run"
      ? String((payload as { command?: unknown }).command ?? "")
      : "";
  const commandRejected = actionKind === "shell.run" && isUnsupportedShellCommand(shellCommand);

  const launch = async () => {
    if (submitting) return;
    if (commandRejected) {
      setError(deviceErrorCopy("command_unsupported", { deviceName }));
      return;
    }
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
        disabled={submitting || commandRejected}
        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? "正在排队…" : label}
      </button>
      {actionKind === "shell.run" ? (
        <>
          <p className="mt-2 text-sm text-amber-700" data-shell-confirmation-notice>
            命令执行每次都要在{deviceName}上单独确认，不能一次授权长期生效。
          </p>
          <p className="mt-1 text-sm text-slate-600" data-shell-command-shape-hint>
            {SHELL_COMMAND_SHAPE_HINT}
          </p>
        </>
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
      {commandRejected ? (
        <p className="mt-2 text-sm text-red-700" role="alert" data-command-unsupported>
          {deviceErrorCopy("command_unsupported", { deviceName })}
        </p>
      ) : null}
      {error && !commandRejected ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
