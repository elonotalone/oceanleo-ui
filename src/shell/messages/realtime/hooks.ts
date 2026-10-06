// 消息实时通道的 React 钩子（契约 §8.3）。B1 阶段只有签名：连接层（socket.ts / store.ts）随后接入。
import type { ImEvent, ImPresence, ImUnread } from "../../../lib/im/types";

export type ImConnectionState = "connecting" | "open" | "closed" | "disabled";

export function useImEvent<T extends ImEvent["type"]>(
  _type: T,
  _handler: (event: Extract<ImEvent, { type: T }>) => void,
): void {}

export function useImUnread(): ImUnread | null {
  return null;
}

export function usePresence(_userIds: string[]): Record<string, ImPresence> {
  return {};
}

export function sendTyping(_conversationId: string, _threadRootId?: string | null): void {}

export function useImConnection(): ImConnectionState {
  return "disabled";
}
