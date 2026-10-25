import type { DeviceApiResult } from "../../api/devices";
import type { DeviceSettingsClient, DeviceSettingsOperation } from "../../api/device-settings";

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/** Start once; poll the receipt, never replay a mutation after an unknown ACK. */
export async function runDeviceSettingsOperation(
  client: DeviceSettingsClient,
  deviceId: string,
  operation: Parameters<DeviceSettingsClient["startOperation"]>[1],
  signal: AbortSignal,
  { intervalMs = 750, timeoutMs = 45_000 } = {},
): Promise<DeviceApiResult<DeviceSettingsOperation>> {
  const deadline = Date.now() + timeoutMs;
  let result = await client.startOperation(deviceId, operation, signal);
  if (signal.aborted) return { ok: false, error: "aborted" };
  if (!result.ok || !result.data) return result;
  const operationId = result.data.operation_id;
  while (result.data?.state === "pending") {
    if (!operationId) return { ok: false, error: "response_malformed" };
    if (Date.now() >= deadline) return { ok: false, error: "request_expired" };
    await pause(Math.min(intervalMs, Math.max(0, deadline - Date.now())), signal);
    if (signal.aborted) return { ok: false, error: "aborted" };
    result = await client.getOperation(deviceId, operationId, signal);
    if (signal.aborted) return { ok: false, error: "aborted" };
    if (!result.ok || !result.data) return result;
  }
  if (result.data?.state === "failed") return { ok: false, error: result.data.error || "operation_failed" };
  return result;
}

export function deviceSettingsErrorCopy(error?: string): string {
  switch (error) {
    case "signed_out": case "device_signed_out": return "这台电脑尚未登录。";
    case "offline": case "device_offline": return "这台电脑不在线。";
    case "unauthorized": return "请先登录。";
    case "path_outside_grant": case "grant_missing": return "这个文件夹未获授权。";
    case "not_directory": case "path_not_directory": return "请选择文件夹。";
    case "path_not_found": return "找不到这个文件夹。";
    case "request_expired": case "operation_expired": return "请求已超时，请重试。";
    case "controller_identity_unavailable": return "无法保存此设备的身份，请允许本地存储后重试。";
    case "network_error": return "连接失败，请重试。";
    case "revoked": return "访问权限已撤销。";
    case "unsupported": case "settings_unavailable": return "请更新这台电脑上的 OceanLeo。";
    default: return "操作未完成，请重试。";
  }
}
