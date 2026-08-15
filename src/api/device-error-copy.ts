/**
 * The device bridge's user-visible copy for every protocol §7 error code.
 *
 * The wording is dictated verbatim by the code contract
 * (`06-code-contract.md` §1); nothing here may be reworded locally, and an
 * unrecognised code must never reach the user as an English token.
 *
 * This module deliberately imports nothing so that every surface — the devices
 * page, the local task launcher, the progress panel — can share one table.
 */

export const DEVICE_ERROR_CODES = [
  "device_offline",
  "local_exec_disabled",
  "grant_missing",
  "path_outside_grant",
  "confirm_timeout",
  "revoked",
  "pair_code_invalid",
  "action_kind_unknown",
  "user_denied",
  "command_unsupported",
  "quota_paired_devices",
  "quota_unfinished_tasks",
  "quota_rate",
  "quota_pair_codes",
  "payload_field_missing",
  "payload_field_unknown",
  "payload_field_type_invalid",
  "payload_path_not_absolute",
] as const;

export type DeviceErrorCode = (typeof DEVICE_ERROR_CODES)[number];

/** Contract §1.3: every unrecognised code collapses to this one sentence. */
export const DEVICE_ERROR_UNKNOWN_COPY = "这一步没有完成，请稍后重试。";

/**
 * The `{上限}` placeholder has no carrier on the wire yet, so the numbers from
 * migration `0179_device_bridge_quotas.sql` are used whenever the response does
 * not name a limit.
 */
export const DEVICE_QUOTA_FALLBACK_LIMITS: Readonly<Record<string, number>> = {
  quota_paired_devices: 20,
  quota_unfinished_tasks: 100,
};

export interface DeviceErrorCopyContext {
  deviceName?: string;
  limit?: number | string;
}

export function isDeviceErrorCode(value: unknown): value is DeviceErrorCode {
  return DEVICE_ERROR_CODES.some((code) => code === value);
}

function limitFor(code: DeviceErrorCode, context: DeviceErrorCopyContext): string {
  if (context.limit !== undefined && context.limit !== "") return String(context.limit);
  const fallback = DEVICE_QUOTA_FALLBACK_LIMITS[code];
  return fallback === undefined ? "" : String(fallback);
}

/**
 * @param code protocol §7 code, or anything at all — unknown input is safe.
 * @returns Chinese copy that is always safe to render to a signed-in user.
 */
export function deviceErrorCopy(
  code: string | undefined | null,
  context: DeviceErrorCopyContext = {},
): string {
  if (!isDeviceErrorCode(code)) return DEVICE_ERROR_UNKNOWN_COPY;
  const deviceName = context.deviceName || "这台电脑";
  switch (code) {
    case "device_offline":
      return `任务已排队，等${deviceName}上线后这一步会自动继续。`;
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
    case "pair_code_invalid":
      return "配对码无效或已过期，请在客户端里重新获取";
    case "action_kind_unknown":
      return "这个本机操作暂不受支持，请刷新页面后再试。";
    case "user_denied":
      return `你在${deviceName}上拒绝了这一步。`;
    case "command_unsupported":
      return "这条命令包含管道或重定向，本机执行不支持；请拆成单条命令。";
    case "quota_paired_devices":
      return `已连接的电脑达到上限（${limitFor(code, context)}台）。撤销一台再连新的。`;
    case "quota_unfinished_tasks":
      return `还有${limitFor(code, context)}个任务没跑完，等它们结束再下单。`;
    case "quota_rate":
      return "下单太频繁了，过一会儿再试。";
    case "quota_pair_codes":
      return "配对码请求太频繁了，过一会儿再试。";
    case "payload_field_missing":
      return "这一步缺少必要参数，请刷新页面后重试。";
    case "payload_field_unknown":
      return "这一步的参数不被支持，请刷新页面后重试。";
    case "payload_field_type_invalid":
      return "这一步的参数格式不对，请刷新页面后重试。";
    case "payload_path_not_absolute":
      return "请填写完整的绝对路径，例如 /Users/你/文档 或 C:\\Users\\你\\Documents。";
  }
}

/**
 * Characters the device's `split_command` refuses because it never goes through
 * a shell (contract §4). Blocking them in the browser keeps a doomed task from
 * being dispatched at all — `shell.run` may not return `stderr_tail`, so a
 * server-side failure would reach the user as a bare "执行失败".
 */
export const UNSUPPORTED_SHELL_COMMAND_CHARS = ["|", ";", "&", ">", "<", "`", "$("] as const;

export const SHELL_COMMAND_SHAPE_HINT =
  "这里只能写一条命令，不经过 shell：管道 |、重定向 > <、串联 ; &&、反引号和 $() 都不支持。";

export function isUnsupportedShellCommand(command: string): boolean {
  return UNSUPPORTED_SHELL_COMMAND_CHARS.some((token) => command.includes(token));
}
