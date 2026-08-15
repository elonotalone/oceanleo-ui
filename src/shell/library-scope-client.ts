"use client";

import { devicesFacade } from "../facades/devices";
import {
  createLocalTask,
  watchLocalTask,
  type LocalTask,
} from "./local-task-client";
import type {
  LibraryDevice,
  LibraryScopeAdapter,
  LocalLibrarySnapshot,
} from "./library-scope";

export async function listLibraryDevices(): Promise<readonly LibraryDevice[]> {
  const result = await devicesFacade.listDevices();
  if (!result.ok || !result.data) {
    throw new Error(result.error || "设备列表加载失败，请稍后重试。");
  }
  return result.data;
}

export function normalizeAbsoluteLibraryPath(value: string): string | null {
  const path = value.trim();
  if (!path) return null;
  const posixAbsolute = path.startsWith("/");
  const driveAbsolute = /^[A-Za-z]:[\\/]/.test(path);
  const uncAbsolute = /^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(path);
  return posixAbsolute || driveAbsolute || uncAbsolute ? path : null;
}

function terminalFailure(task: LocalTask, device: LibraryDevice): Error {
  switch (task.status) {
    case "denied":
      if (task.denyReason === "path_outside_grant") {
        return new Error(
          `这个路径不在${device.device_name}已授权的目录范围内。`,
        );
      }
      return new Error("这台电脑拒绝了本地库列表请求，请在那台电脑上检查授权。");
    case "expired":
      return new Error("本地库列表请求已过期，请确认这台电脑在线后重试。");
    case "cancelled":
      return new Error("本地库列表请求已取消。");
    default:
      return new Error("这台电脑没能返回本地库列表，请在那台电脑上检查后重试。");
  }
}

/**
 * Compose W7's task client; this module intentionally contains no fetch or
 * polling implementation of its own. Protocol §4.1 requires the user-selected
 * absolute grant path to be sent as the fs.list payload.
 */
export async function refreshDeviceLocalLibrary(
  device: LibraryDevice,
  path: string,
): Promise<LocalLibrarySnapshot> {
  const absolutePath = normalizeAbsoluteLibraryPath(path);
  if (!absolutePath) {
    throw new Error("请输入这台设备已授权目录的绝对路径。");
  }
  const created = await createLocalTask(device.device_id, "fs.list", {
    path: absolutePath,
  });
  return new Promise<LocalLibrarySnapshot>((resolve, reject) => {
    let settled = false;
    let stop = () => {};
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      stop();
      callback();
    };
    stop = watchLocalTask(
      created.taskId,
      (task) => {
        if (task.status === "succeeded") {
          finish(() =>
            resolve({
              files: task.resultSummary?.files || [],
              updatedAt: new Date().toISOString(),
            }),
          );
          return;
        }
        if (
          task.status === "failed" ||
          task.status === "denied" ||
          task.status === "expired" ||
          task.status === "cancelled"
        ) {
          finish(() => reject(terminalFailure(task, device)));
        }
      },
      {
        onError: () =>
          finish(() => reject(new Error("暂时读不到本地库进度，请检查网络后重试。"))),
      },
    );
  });
}

export const defaultLibraryScopeAdapter: Required<LibraryScopeAdapter> = {
  listDevices: listLibraryDevices,
  refreshLocalLibrary: refreshDeviceLocalLibrary,
};
