import type { AgentMessage } from "../lib/agent";

/** A receipt does not mean that the native agent has consumed the input. */
export function nativeDeliveryStatus(state: string): string | null {
  switch (state) {
    case "sending":
    case "queued": return "等待处理";
    case "injected": return "已送入当前执行";
    case "replaced": return "已替换";
    case "unsent": return "未发送";
    case "cancelled": return "已撤回";
    // New-turn input is an ordinary conversation bubble. Unknown legacy
    // receipts cannot truthfully claim injection into a current turn either.
    default: return null;
  }
}

/** Use the event's time even when archive hydration arrives much later. */
export function nativeLastActivity(messages: readonly AgentMessage[]): { at: string; user: boolean } | null {
  let latest: { at: string; user: boolean } | null = null;
  let latestMs = -Infinity;
  for (const message of messages) {
    if (message.meta?.native_notice || message.kind === "notice") continue;
    const at = typeof message.meta?.native_updated_at === "string"
      ? message.meta.native_updated_at : message.created_at;
    const time = typeof at === "string" ? Date.parse(at) : NaN;
    if (Number.isFinite(time) && time >= latestMs) {
      latestMs = time;
      latest = { at: at!, user: message.role === "user" };
    }
  }
  return latest;
}

/** A waiting prompt must not borrow a background turn's thinking indicator. */
export function nativeThinkingVisible(messages: readonly AgentMessage[], running: boolean, live: boolean): boolean {
  if (!running || !live) return false;
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  const delivery = messages[lastUser]?.meta?.native_delivery as { state?: string } | undefined;
  if (delivery?.state === "queued" || delivery?.state === "sending" || delivery?.state === "unsent" || delivery?.state === "cancelled") return false;
  return !messages.slice(lastUser + 1).some((message) => message.role === "assistant");
}
