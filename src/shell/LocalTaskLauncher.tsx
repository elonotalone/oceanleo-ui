"use client";

import { useEffect, useState } from "react";

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
import {
  canHandOffFiles,
  handoffFailureMessage,
  handoffFolderNote,
  handoffOfflineNotice,
  handoffProgressText,
  handoffSendLabel,
  handoffSuccessText,
  pickFileForHandoff,
  planFileHandoff,
  sendFileHandoff,
  type HandoffFolders,
  type HandoffProgress,
} from "./mobile-file-handoff";
import { useUI } from "../i18n/ui/useUI";

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

export interface LocalFileHandoffLauncherProps {
  deviceId: string | null | undefined;
  deviceName?: string;
  deviceOnline?: boolean;
  /** 只能来自那台电脑上报的授权目录（网关 `GET /v1/devices?folders=true`）。 */
  folders: HandoffFolders;
  devicesHref?: string;
  className?: string;
  onSent?: (path: string) => void;
}

/**
 * 「发送到这台电脑」——把手机上刚拍的照片、刚录的音直接送进那台电脑的授权目录。
 *
 * **浏览器里这个组件什么都不渲染。** 不是因为它会出错，而是因为它承诺的正是浏览器
 * 做不到的那件事：一个在浏览器里出现的「发送到这台电脑」按钮是在骗人。原生宿主的
 * 判定放在挂载之后做，这样服务端渲染出来的东西跟浏览器里一模一样，不会水合不一致。
 *
 * 落点只能从下拉框里选，**没有手敲路径的口子**。手敲路径看着像功能，实际是绕过授权：
 * 那台电脑会把范围外的路径拒成 `path_outside_grant`，等于先请用户瞄准一个没人授权的
 * 文件夹，再当着他的面拒绝他。
 *
 * 这一屏的每一句话都走 `tt()`，包括送达逻辑那一层报回来的进度与失败态 ——
 * 手机壳打开的就是这个网站，日语用户点开「发送到电脑」不该看到一屏中文。
 */
export function LocalFileHandoffLauncher({
  deviceId,
  deviceName: deviceNameProp,
  deviceOnline = true,
  folders,
  devicesHref = "/devices",
  className,
  onSent,
}: LocalFileHandoffLauncherProps) {
  const tt = useUI();
  const deviceName = deviceNameProp || tt("这台电脑");
  const [native, setNative] = useState(false);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<HandoffProgress | null>(null);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setNative(canHandOffFiles());
  }, []);

  const choices = folders?.folders ?? [];
  const selected = folder || choices[0] || "";

  if (!native) return null;

  if (!deviceId) {
    return (
      <div className={className} data-file-handoff="no-device">
        <a
          href={devicesHref}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white"
        >
          {tt("去连接一台电脑")}
        </a>
      </div>
    );
  }

  const send = async () => {
    if (busy) return;
    setError("");
    setDone("");
    setProgress(null);
    const media = await pickFileForHandoff();
    // 用户自己退出了选择器不是错误，界面上不该冒出一行红字。
    if (!media) return;
    const plan = planFileHandoff({
      media,
      folder: selected,
      deviceName,
      deviceOnline,
      tt,
    });
    if (!plan.ok) {
      setError(plan.message);
      return;
    }
    setBusy(true);
    try {
      const result = await sendFileHandoff({
        deviceId,
        deviceName,
        deviceOnline,
        plan,
        onProgress: setProgress,
        tt,
      });
      if (result.ok) {
        setDone(handoffSuccessText(result, deviceName, tt));
        onSent?.(result.path);
      } else {
        setError(result.message);
      }
    } catch (caught) {
      const code = caught instanceof LocalTaskApiError ? caught.code : "network_error";
      setError(handoffFailureMessage(code, deviceName, {}, tt));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div
      className={className}
      data-file-handoff={deviceOnline ? "online" : "offline"}
      data-file-handoff-source={folders?.source ?? "none"}
    >
      {choices.length > 0 ? (
        <label className="block text-sm text-slate-700">
          {tt("落点文件夹")}
          <select
            value={selected}
            onChange={(event) => setFolder(event.target.value)}
            disabled={busy}
            className="mt-1 block w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            data-file-handoff-folder
          >
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <p className="mt-2 text-sm text-slate-600" data-file-handoff-note>
        {handoffFolderNote(folders, deviceName, tt)}
      </p>
      <button
        type="button"
        onClick={() => void send()}
        disabled={busy || choices.length === 0}
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? tt("正在发送…") : handoffSendLabel(deviceName, tt)}
      </button>
      {progress ? (
        <p className="mt-2 text-sm text-slate-600" role="status" data-file-handoff-progress>
          {handoffProgressText(progress, deviceName, tt)}
        </p>
      ) : null}
      {!deviceOnline ? (
        <p className="mt-2 text-sm text-amber-700" role="status" data-file-handoff-offline>
          {handoffOfflineNotice(deviceName, tt)}
        </p>
      ) : null}
      {done ? (
        <p className="mt-2 text-sm text-emerald-700" role="status" data-file-handoff-done>
          {done}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert" data-file-handoff-error>
          {error}
        </p>
      ) : null}
    </div>
  );
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
