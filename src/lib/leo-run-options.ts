// ============================================================================
// @oceanleo/ui — 云端 Leo 的「快速模式」（2026-10-31 晚 W7，operator 要点 12）
// ----------------------------------------------------------------------------
// 输入框设置菜单（ModelGroupPicker 紧凑态）是唯一写入方；建任务 / 追问两条发送
// 路径只从这里读，字段名固定 `fast_mode`（网关 agent_router 收，llm 主干据此少思考）。
// 和付费主体（payer.ts）同一种取法：存 localStorage，关 = 删键；只在开的时候带字段，
// 老网关不认这个字段时请求体与以前逐字相同。
// ============================================================================

export const LEO_FAST_MODE_KEY = "oceanleo.leo.fast-mode";
/** 同页多个输入框之间同步（detail: boolean）。 */
export const LEO_FAST_MODE_EVENT = "oceanleo:leo-fast-mode";

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLeoFastMode(): boolean {
  return store()?.getItem(LEO_FAST_MODE_KEY) === "1";
}

export function writeLeoFastMode(on: boolean): void {
  const target = store();
  if (target) {
    try {
      if (on) target.setItem(LEO_FAST_MODE_KEY, "1");
      else target.removeItem(LEO_FAST_MODE_KEY);
    } catch { /* private mode: the choice lasts for this page only */ }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<boolean>(LEO_FAST_MODE_EVENT, { detail: on }));
  }
}

/** 直接展开进 `/v1/agent/tasks` 与 `/messages` 请求体：开 = `{ fast_mode: true }`，关 = `{}`。 */
export function leoRunRequestFields(): { fast_mode?: true } {
  return readLeoFastMode() ? { fast_mode: true } : {};
}
