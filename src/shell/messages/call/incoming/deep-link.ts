// 通话深链（合同 §3.3 浏览器推送：私聊来电 `url = /leochat?c=<cid>&call=<call_id>`；任务书 P4）。
// 推送点开 → 新标签页 /leochat → LeoChatPage 调 `consumeCallDeepLink()`：打开该会话、记下待核实的来电、把两个参数从地址栏清掉。
// IncomingCallHost 拿到待核实的来电后 `GET …/call` 核实这通还在进行，才弹接听卡片。
// 解析纯 TS（tests/call-chat-incoming.test.mjs 直接跑）；不认的值一律当没有（fail closed）。
import { openMessages } from "../../host-state";

export const CALL_LINK_CONVERSATION_PARAM = "c";
export const CALL_LINK_CALL_PARAM = "call";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;

export interface CallDeepLink {
  conversationId: string;
  callId: string | null;
}

export function parseCallDeepLink(search: string): CallDeepLink | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search || "");
  } catch {
    return null;
  }
  const conversationId = (params.get(CALL_LINK_CONVERSATION_PARAM) || "").trim();
  if (!ID_PATTERN.test(conversationId)) return null;
  // 交易会话没有通话：链接当没有。
  if (conversationId.startsWith("talent:")) return null;
  const rawCall = (params.get(CALL_LINK_CALL_PARAM) || "").trim();
  return { conversationId, callId: ID_PATTERN.test(rawCall) ? rawCall : null };
}

/** 去掉 `c` 与 `call` 两个参数，别的原样保留；返回 `?…` 或空串。 */
export function stripCallDeepLink(search: string): string {
  const params = new URLSearchParams(search || "");
  params.delete(CALL_LINK_CONVERSATION_PARAM);
  params.delete(CALL_LINK_CALL_PARAM);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export interface PendingCallLink {
  /** 单调递增的序号：来电宿主按它判断「这条处理过没有」（同一毫秒连来两条也分得开）。 */
  id: number;
  conversationId: string;
  callId: string;
  at: number;
}

let pending: PendingCallLink | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

export function pendingCallLink(): PendingCallLink | null {
  return pending;
}

export function setPendingCallLink(next: Omit<PendingCallLink, "id"> | null): void {
  pending = next ? { ...next, id: ++nextId } : null;
  for (const listener of Array.from(listeners)) listener();
}

export function subscribePendingCallLink(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface CallLinkEnv {
  location: { pathname: string; search: string; hash: string };
  history: { readonly state: unknown; replaceState(state: unknown, title: string, url: string): void };
  open(conversationId: string): void;
  now(): number;
}

function browserEnv(): CallLinkEnv | null {
  if (typeof window === "undefined") return null;
  return {
    location: window.location,
    history: window.history,
    open: (conversationId) => openMessages({ conversationId }),
    now: () => Date.now(),
  };
}

/**
 * LeoChat 整页可用之后调一次：地址栏带通话深链就打开该会话、登记待核实的来电并清掉参数。
 * 返回是否处理了深链。
 */
export function consumeCallDeepLink(env: CallLinkEnv | null = browserEnv()): boolean {
  if (!env) return false;
  const link = parseCallDeepLink(env.location.search);
  if (!link) return false;
  env.open(link.conversationId);
  if (link.callId) setPendingCallLink({ conversationId: link.conversationId, callId: link.callId, at: env.now() });
  try {
    env.history.replaceState(
      env.history.state,
      "",
      `${env.location.pathname}${stripCallDeepLink(env.location.search)}${env.location.hash || ""}`,
    );
  } catch {
    /* 地址栏改不了不影响打开 */
  }
  return true;
}
