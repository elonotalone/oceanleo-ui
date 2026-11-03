import type { DeviceApiResult } from "../../api/devices";
import type { DeviceSettingsClient, DeviceSettingsOperation } from "../../api/device-settings";

/** Bound the whole request, including a transport that never settles on abort. */
export function runDeviceRequest<T>(
  request: (signal: AbortSignal) => Promise<DeviceApiResult<T>>,
  signal: AbortSignal,
  timeoutMs = 15_000,
): Promise<DeviceApiResult<T>> {
  if (signal.aborted) return Promise.resolve({ ok: false, error: "aborted" });
  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;
    let expired = false;
    const finish = (result: DeviceApiResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", aborted);
      // Dispose request-scoped work on success too; do not retain a parent listener per poll.
      controller.abort();
      resolve(result);
    };
    const aborted = () => finish({ ok: false, error: expired ? "request_expired" : "aborted" });
    const cancel = () => controller.abort();
    const timer = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
    signal.addEventListener("abort", cancel, { once: true });
    controller.signal.addEventListener("abort", aborted, { once: true });
    try {
      void request(controller.signal).then(finish, () => finish({ ok: false, error: "network_error" }));
    } catch { finish({ ok: false, error: "network_error" }); }
  });
}

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
  return runDeviceRequest(async (requestSignal) => {
    let result = await client.startOperation(deviceId, operation, requestSignal);
    if (requestSignal.aborted) return { ok: false, error: "aborted" };
    if (!result.ok || !result.data) return result;
    const operationId = result.data.operation_id;
    while (result.data?.state === "pending") {
      if (!operationId) return { ok: false, error: "response_malformed" };
      await pause(intervalMs, requestSignal);
      if (requestSignal.aborted) return { ok: false, error: "aborted" };
      result = await client.getOperation(deviceId, operationId, requestSignal);
      if (requestSignal.aborted) return { ok: false, error: "aborted" };
      if (!result.ok || !result.data) return result;
    }
    if (result.data?.state === "failed") return { ok: false, error: result.data.error || "operation_failed" };
    return result;
  }, signal, timeoutMs);
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
