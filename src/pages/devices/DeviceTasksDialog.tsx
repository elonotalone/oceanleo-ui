"use client";

import { useEffect, useState } from "react";
import type { DeviceSettingsClient, DeviceTaskSummary } from "../../api/device-settings";
import { useUI } from "../../i18n/ui/useUI";
import { DEVICE_BUTTON, DeviceDialog } from "./DeviceDialog";
import { deviceSettingsErrorCopy } from "./device-settings-state";

const STATUS: Record<string, string> = { queued: "等待中", claimed: "执行中", running: "执行中", succeeded: "已完成", failed: "失败", denied: "已拒绝", cancelled: "已取消", canceled: "已取消", expired: "已超时" };
const ACTION: Record<string, string> = { "fs.list": "读取文件夹", "fs.read_summary": "读取文件", "file.write": "保存文件", "python.run": "Python 任务", "shell.run": "终端任务", "app.open": "打开应用" };

export function DeviceTasksDialog({ deviceId, deviceName, client, onClose }: { deviceId: string; deviceName: string; client: DeviceSettingsClient; onClose: () => void }) {
  const tt = useUI();
  const [tasks, setTasks] = useState<DeviceTaskSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await client.listTasks(deviceId, controller.signal);
        if (controller.signal.aborted) return;
        if (result.ok && result.data) { setTasks(result.data); setError(null); }
        else setError(deviceSettingsErrorCopy(result.error));
      } catch { if (!controller.signal.aborted) setError(deviceSettingsErrorCopy("network_error")); }
      finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(load, 5000); }
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [client, deviceId, revision]);
  return <DeviceDialog title={tt("{name} · 任务", { name: deviceName })} onClose={onClose} testId="tasks">
    {error && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-600" role="alert">{tt(error)}<button type="button" className={DEVICE_BUTTON} onClick={() => setRevision((value) => value + 1)}>{tt("重试")}</button></div>}
    {loading ? <p role="status" className="py-8 text-center text-sm text-neutral-500">{tt("正在加载…")}</p> : tasks.length === 0 ? <p className="py-16 text-center text-sm text-neutral-400">{tt("暂无任务")}</p> : <ul className="divide-y divide-neutral-200">
      {tasks.map((task) => <li key={task.task_id} className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0"><p className="text-sm font-medium text-neutral-800">{tt(ACTION[task.action_kind] ?? "设备任务")}</p><p className="mt-1 text-xs text-neutral-400">{formatDeviceTime(task.created_at)}</p>{task.deny_reason && <p className="mt-1 text-xs text-neutral-500">{tt(deviceSettingsErrorCopy(task.deny_reason))}</p>}</div>
        <span className="shrink-0 rounded-lg bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{tt(STATUS[task.status] ?? "状态未知")}</span>
      </li>)}
    </ul>}
  </DeviceDialog>;
}

export function formatDeviceTime(value: string | null) {
  if (!value) return "—";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "—" : timestamp.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}
