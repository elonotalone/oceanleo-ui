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

function terminalFailure(task: LocalTask): Error {
  switch (task.status) {
    case "denied":
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
 * polling implementation of its own. An empty payload asks the device to list
 * its locally configured library grants without exposing their paths here.
 */
export async function refreshDeviceLocalLibrary(
  device: LibraryDevice,
): Promise<LocalLibrarySnapshot> {
  const created = await createLocalTask(device.device_id, "fs.list", {});
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
          finish(() => reject(terminalFailure(task)));
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
