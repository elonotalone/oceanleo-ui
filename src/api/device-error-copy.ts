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
  "quota_unpaired_devices",
  "payload_field_missing",
  "payload_field_unknown",
  "payload_field_type_invalid",
  "payload_path_not_absolute",
] as const;

export type DeviceErrorCode = (typeof DEVICE_ERROR_CODES)[number];

/**
 * 这张表的翻译口，形状与 `useUI()` 的 `tt` 相同（中文原文即 key，未命中回退原文）。
 *
 * 为什么是可选参数而不是在这里调 hook：这张表由六个读取方共用，其中大半是纯函数
 * 或 `useEffect` 里的取数回调，取不到 hook。不传就落回中文原文 ——
 * **不传的读取方逐字不变**，而手机送达那一屏由 `mobile-file-handoff.ts` 把
 * `useUI()` 的 `tt` 传下来，日语用户看到的才是日语。
 */
export type DeviceErrorTranslate = (zh: string) => string;

const KEEP_ZH: DeviceErrorTranslate = (zh) => zh;

/**
 * Contract §1.3: every unrecognised code collapses to this one sentence.
 *
 * 为什么是函数而不是一句 `export const`：常量只有一种读法 —— 谁 `import` 到就直接
 * 渲染，句子里没有任何位置能换成用户自己的语言。这张表上最后两句漏中文的正是常量
 * 那两句。改成函数以后翻译口进了签名：不传 `tt` 就是今天这句中文（读取方逐字不变），
 * 传了就是那门语言，而且**再也没有一条不经过 `tt` 的路径**。
 */
export function deviceErrorUnknownCopy(tt: DeviceErrorTranslate = KEEP_ZH): string {
  return tt("这一步没有完成，请稍后重试。");
}

export interface DeviceErrorCopyContext {
  deviceName?: string;
  /** `detail.limit` from the refusal, and only that (contract §1.2b). */
  limit?: number | string;
  /** 缺省即中文原文，见 `DeviceErrorTranslate`。 */
  tt?: DeviceErrorTranslate;
}

export function isDeviceErrorCode(value: unknown): value is DeviceErrorCode {
  return DEVICE_ERROR_CODES.some((code) => code === value);
}

/**
 * 设备名与上限由这里填，不交给 `tt` 自己插值：`tt` 在这张表上的合同只有「查表」
 * 一件，把填空押在它身上，一个只查表的实现就会把 `{device}` 漏到用户脸上。
 *
 * 填空放在取译文之后，所以「设备名在句子里的位置」由每种语言的译文自己决定 ——
 * 阿拉伯语和德语都不会把设备名钉在句首。
 */
function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/**
 * Contract §1.2b: the ceiling may only ever come off the wire. Guessing one
 * from the migration file means the page starts lying the day a quota changes,
 * and no test goes red — so a missing `limit` drops the number instead, and
 * the advice, which is the part the user acts on, is kept word for word.
 */
function limitText(context: DeviceErrorCopyContext): string | null {
  if (context.limit === undefined || context.limit === "") return null;
  return String(context.limit);
}

/**
 * @param code protocol §7 code, or anything at all — unknown input is safe.
 * @returns copy that is always safe to render to a signed-in user; Chinese
 *   unless the caller hands in a `tt`, in which case it is that user's own
 *   language.
 */
export function deviceErrorCopy(
  code: string | undefined | null,
  context: DeviceErrorCopyContext = {},
): string {
  const t = context.tt ?? KEEP_ZH;
  if (!isDeviceErrorCode(code)) return deviceErrorUnknownCopy(t);
  const device = context.deviceName || t("这台电脑");
  switch (code) {
    case "device_offline":
      return fill(t("任务已排队，等{device}上线后这一步会自动继续。"), { device });
    case "local_exec_disabled":
      return fill(
        t("{device}还没允许云端下发。这个开关只能在那台电脑上打开（托盘图标里）。"),
        { device },
      );
    case "grant_missing":
      return fill(t("{device}还没授权这类操作。需要在那台电脑上授权后重新发起。"), {
        device,
      });
    case "path_outside_grant":
      return fill(
        t(
          "这个路径不在{device}已授权的目录范围内。请在那台电脑上选择已授权目录，或由电脑前的人调整授权。",
        ),
        { device },
      );
    case "confirm_timeout":
      return fill(
        t("{device}上没有人在 90 秒内确认，这一步已取消。请回到那台电脑上重新发起。"),
        { device },
      );
    case "revoked":
      return fill(t("{device}已被撤销，需要在那台电脑上重新配对。"), { device });
    case "pair_code_invalid":
      return t("配对码无效或已过期，请在客户端里重新获取");
    case "action_kind_unknown":
      return t("这个本机操作暂不受支持，请刷新页面后再试。");
    case "user_denied":
      return fill(t("你在{device}上拒绝了这一步。"), { device });
    case "command_unsupported":
      return t("这条命令包含管道或重定向，本机执行不支持；请拆成单条命令。");
    case "quota_paired_devices": {
      const limit = limitText(context);
      return limit === null
        ? t("已连接的电脑达到上限。撤销一台再连新的。")
        : fill(t("已连接的电脑达到上限（{limit}台）。撤销一台再连新的。"), { limit });
    }
    case "quota_unfinished_tasks": {
      const limit = limitText(context);
      return limit === null
        ? t("还有任务没跑完，等它们结束再下单。")
        : fill(t("还有{limit}个任务没跑完，等它们结束再下单。"), { limit });
    }
    case "quota_rate":
      return t("下单太频繁了，过一会儿再试。");
    case "quota_pair_codes":
      return t("配对码请求太频繁了，过一会儿再试。");
    // Not a frequency problem: waiting never clears it, so the advice differs
    // from `quota_pair_codes` (contract §1.2c).
    case "quota_unpaired_devices": {
      const limit = limitText(context);
      return limit === null
        ? t("有电脑还没完成连接。先在其中一台上连完，或撤销它们。")
        : fill(t("有 {limit} 台电脑还没完成连接。先在其中一台上连完，或撤销它们。"), {
            limit,
          });
    }
    case "payload_field_missing":
      return t("这一步缺少必要参数，请刷新页面后重试。");
    case "payload_field_unknown":
      return t("这一步的参数不被支持，请刷新页面后重试。");
    case "payload_field_type_invalid":
      return t("这一步的参数格式不对，请刷新页面后重试。");
    case "payload_path_not_absolute":
      return t("请填写完整的绝对路径，例如 /Users/你/文档 或 C:\\Users\\你\\Documents。");
  }
}

/**
 * Characters the device's `split_command` refuses because it never goes through
 * a shell (contract §4). Blocking them in the browser keeps a doomed task from
 * being dispatched at all — `shell.run` may not return `stderr_tail`, so a
 * server-side failure would reach the user as a bare "执行失败".
 */
export const UNSUPPORTED_SHELL_COMMAND_CHARS = ["|", ";", "&", ">", "<", "`", "$("] as const;

/**
 * 输入框下面那一句「这里能写什么」的提示，和上面那句兜底一样只走 `tt`：
 * 它是这张表里唯一一句**不是失败文案**的话，但用户读到它的时机（正准备敲命令）
 * 恰恰是最需要看懂的时候，所以它没有资格留在中文里。
 */
export function shellCommandShapeHint(tt: DeviceErrorTranslate = KEEP_ZH): string {
  return tt(
    "这里只能写一条命令，不经过 shell：管道 |、重定向 > <、串联 ; &&、反引号和 $() 都不支持。",
  );
}

export function isUnsupportedShellCommand(command: string): boolean {
  return UNSUPPORTED_SHELL_COMMAND_CHARS.some((token) => command.includes(token));
}
