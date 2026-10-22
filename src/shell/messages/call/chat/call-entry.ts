// 「通话」入口的判定与动作（任务书 P1；合同 §1 A1/A3/A20）。纯 TS，tests/call-chat-entry.test.mjs 直接跑。
//
// 产品规则（操作员已定）：点了就进——不预览、不检查麦克风、不邀请审批、不弹任何设置框。
// 唯一的确认：已经在**别的**会话通话里时，先问「离开当前通话并加入这里？」。
// 交易（talent）会话没有通话；已解散 / 非成员不显示（由会话视图判，不传进来就不渲染）。
import type { ImConversationKind } from "../../../../lib/im/types";
import type { CallPhase } from "../engine";

export type CallEntryState =
  /** 不显示入口（交易会话、会话还没加载出来）。 */
  | "hidden"
  /** 没在通话里：点一下进入（有进行中的就加入，没有就新建）。 */
  | "idle"
  /** 已经在这个会话的通话里：按钮写「通话中」，点击展开小窗。 */
  | "in_this_call"
  /** 在别的会话通话里：点击先确认离开再加入。 */
  | "in_other_call"
  /** 正在离开上一通：稍等，不接受新的点击。 */
  | "busy";

/** 引擎这些阶段算「人在通话里」（小窗在场）。 */
export function isLivePhase(phase: CallPhase): boolean {
  return phase === "joining" || phase === "connected" || phase === "reconnecting";
}

export function isTalentConversation(conversationId: string, kind?: ImConversationKind | null): boolean {
  return kind === "talent" || conversationId.startsWith("talent:");
}

/**
 * 顶栏按钮：会话类型还没加载出来（`kind` 为空）或是交易会话 → 不显示。
 * 列表标记 / 聊天卡片拿不到类型：只按 id 判交易会话（`talent:` 前缀）。
 */
export function entryHidden(conversationId: string, kind?: ImConversationKind | null, kindKnown = true): boolean {
  if (!conversationId) return true;
  if (kindKnown && !kind) return true;
  return isTalentConversation(conversationId, kind);
}

export function callEntryState(input: {
  conversationId: string;
  /** 见 `entryHidden`。 */
  hidden: boolean;
  phase: CallPhase;
  /** 引擎当前通话所在会话（`CallSnapshot.conversationId`）。 */
  activeConversationId: string | null;
}): CallEntryState {
  if (!input.conversationId || input.hidden) return "hidden";
  if (isTalentConversation(input.conversationId)) return "hidden";
  if (input.phase === "leaving") return "busy";
  if (isLivePhase(input.phase)) {
    return input.activeConversationId === input.conversationId ? "in_this_call" : "in_other_call";
  }
  return "idle";
}

export interface CallEntryActions {
  startOrJoin(conversationId: string, ctx?: { title?: string }): Promise<void>;
  join(callId: string, conversationId: string, ctx?: { title?: string }): Promise<void>;
  leave(reason?: string): Promise<void>;
}

export interface CallEntryDeps {
  actions: CallEntryActions;
  /** 只在 `in_other_call` 时调用；返回用户是否同意离开当前通话。 */
  confirmSwitch(): Promise<boolean>;
  /** 已在这通里：把小窗展开 / 拉到前面。 */
  focusDock(): void;
}

export type CallEntryOutcome = "entered" | "focused" | "cancelled" | "ignored";

/**
 * 点入口（会话顶栏按钮、列表标记、聊天卡片「加入」）的统一动作。
 * 给了 `callId` 就加入那一通（卡片 / 列表标记），否则「有就加入、没有就新建」（顶栏按钮）。
 * 引擎的失败原样抛出，由界面映射成提示。
 */
export async function enterCall(
  deps: CallEntryDeps,
  state: CallEntryState,
  target: { conversationId: string; title?: string; callId?: string | null },
): Promise<CallEntryOutcome> {
  if (state === "hidden" || state === "busy") return "ignored";
  if (state === "in_this_call") {
    deps.focusDock();
    return "focused";
  }
  if (state === "in_other_call") {
    const ok = await deps.confirmSwitch();
    if (!ok) return "cancelled";
    await deps.actions.leave("switch");
  }
  const ctx = target.title ? { title: target.title } : undefined;
  if (target.callId) await deps.actions.join(target.callId, target.conversationId, ctx);
  else await deps.actions.startOrJoin(target.conversationId, ctx);
  return "entered";
}

/** W07 的小窗听这个 window 事件把自己展开（`signals/W08-to-W07.md`）；没人听时什么也不发生，小窗本来就常驻。 */
export const CALL_DOCK_FOCUS_EVENT = "oceanleo:call-dock-focus";

export function requestDockFocus(target: { dispatchEvent(event: Event): boolean } | null | undefined = typeof window === "undefined" ? null : window): void {
  if (!target) return;
  try {
    target.dispatchEvent(new CustomEvent(CALL_DOCK_FOCUS_EVENT));
  } catch {
    /* 没有 CustomEvent 的环境：忽略 */
  }
}

/** 引擎 / 接口抛出的错误 → 错误码（ImApiError.code、`{detail:{code}}`、Error("not_ready")）。 */
export function callErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = error as { code?: unknown; detail?: { code?: unknown }; message?: unknown };
  if (typeof value.code === "string" && value.code) return value.code;
  if (value.detail && typeof value.detail.code === "string") return value.detail.code;
  if (typeof value.message === "string" && /^[a-z_]{3,40}$/.test(value.message)) return value.message;
  return "";
}
