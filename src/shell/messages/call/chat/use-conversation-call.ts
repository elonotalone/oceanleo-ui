// conversation-calls 的全局单例与 React 钩子：取数走 W05 的 callsApi.status，实时更新走 IM 状态仓的 `call` 事件。
import { useEffect, useSyncExternalStore } from "react";
import { callsApi } from "../../../../lib/im/calls-api";
import { imStore } from "../../realtime/hooks";
import {
  activeCallOf,
  createConversationCalls,
  summaryOfCall,
  type ActiveCallSummary,
  type ConversationCallEntry,
  type ConversationCalls,
} from "./conversation-calls";

let singleton: ConversationCalls | null = null;

/** 实时通道没有（或只是个不完整的替身）时不听事件，退回只用列表数据 / `GET …/call`，不让一行列表因此崩掉。 */
function listen(attach: () => () => void): () => void {
  try {
    const off = attach();
    return typeof off === "function" ? off : () => {};
  } catch {
    return () => {};
  }
}

export function conversationCalls(): ConversationCalls {
  if (!singleton) {
    singleton = createConversationCalls({
      fetchStatus: (conversationId) => callsApi.status(conversationId),
      onCallEvent: (handler) => listen(() => imStore().onEvent("call", handler)),
      onResync: (handler) => listen(() => imStore().onResync(handler)),
      now: () => Date.now(),
    });
  }
  return singleton;
}

const noSubscribe = () => () => {};

/**
 * 订阅某会话的通话条目。`fetch: true`（会话视图、聊天卡片）在没有条目时去取一次 `GET …/call`；
 * 收件箱行不取（用列表接口带来的 `active_call`），避免一页会话打 N 个请求。
 */
export function useConversationCallEntry(
  conversationId: string | null | undefined,
  options: { fetch?: boolean } = {},
): ConversationCallEntry | undefined {
  const store = conversationCalls();
  const entry = useSyncExternalStore(
    conversationId ? store.subscribe : noSubscribe,
    () => (conversationId ? store.get(conversationId) : undefined),
    () => undefined,
  );
  const missing = entry === undefined;
  const wantFetch = Boolean(options.fetch);
  useEffect(() => {
    if (!wantFetch || !conversationId || !missing) return;
    void store.ensure(conversationId);
  }, [store, conversationId, wantFetch, missing]);
  return entry;
}

/** 会话现在的通话摘要：有实时条目以条目为准，否则用列表行的 `active_call`。 */
export function useActiveCallSummary(
  conversationId: string | null | undefined,
  fallback: unknown,
): ActiveCallSummary | null {
  const entry = useConversationCallEntry(conversationId);
  if (entry) return summaryOfCall(entry.call);
  return activeCallOf(fallback);
}
