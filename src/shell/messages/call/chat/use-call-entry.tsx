"use client";

// 三个入口（会话顶栏按钮、会话列表标记、聊天卡片「加入」）共用的点击逻辑：
// 判状态 → 已在这通就展开小窗 / 在别的通话里先确认 / 否则直接进；失败给一条站内提示。
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useUI, type UITranslate } from "../../../../i18n/ui/useUI";
import { ConfirmDialog } from "../../../../ui";
import { useToast } from "../../../../ui/Toast";
import { callActions, callStore, useCall } from "../engine";
import {
  callEntryState,
  callErrorCode,
  enterCall,
  requestDockFocus,
  type CallEntryOutcome,
  type CallEntryState,
} from "./call-entry";

/** 接口 / 引擎错误码 → 一句给人看的话（合同 §3.2 错误码）。 */
export function callErrorText(tt: UITranslate, code: string): string {
  switch (code) {
    case "call_full":
      return tt("通话人数已满（最多 50 人）");
    case "talent_not_supported":
      return tt("交易会话不支持通话");
    case "not_member":
    case "removed_from_conversation":
      return tt("你已不在这个会话里，无法加入通话");
    case "call_unavailable":
      return tt("这通通话已经结束");
    case "artc_not_configured":
      return tt("通话服务暂未开通");
    case "rate_limited":
      return tt("操作太频繁，请稍后再试");
    default:
      return tt("没能加入通话，请稍后再试");
  }
}

export interface CallEntryHandle {
  state: CallEntryState;
  pending: boolean;
  /** 引擎当前通话 id（卡片判断「是不是我正在的这一通」）。 */
  activeCallId: string | null;
  run(target?: { title?: string; callId?: string | null }): Promise<CallEntryOutcome | "failed">;
  /** 「离开当前通话并加入这里？」确认框；没在确认时为 null。调用方把它放进自己的渲染树。 */
  dialog: ReactNode;
}

export function useCallEntry(conversationId: string, hidden: boolean): CallEntryHandle {
  const tt = useUI();
  const toast = useToast();
  const call = useCall();
  const state = callEntryState({
    conversationId,
    hidden,
    phase: call.phase,
    activeConversationId: call.conversationId,
  });
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const busy = useRef(false);

  const run = useCallback(
    async (target: { title?: string; callId?: string | null } = {}): Promise<CallEntryOutcome | "failed"> => {
      if (busy.current) return "ignored";
      busy.current = true;
      setPending(true);
      try {
        return await enterCall(
          {
            actions: callActions,
            confirmSwitch: () =>
              new Promise<boolean>((resolve) => {
                resolver.current = resolve;
                setConfirming(true);
              }),
            focusDock: () => requestDockFocus(),
          },
          state,
          { conversationId, title: target.title, callId: target.callId ?? null },
        );
      } catch (error) {
        // 引擎进了 error 阶段时小窗自己会写原因；否则这里补一条提示，不让点击石沉大海。
        if (callStore.getSnapshot().phase !== "error") toast.error(callErrorText(tt, callErrorCode(error)));
        return "failed";
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [state, conversationId, toast, tt],
  );

  const settle = (ok: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setConfirming(false);
    resolve?.(ok);
  };

  const dialog = confirming ? (
    <ConfirmDialog
      title={tt("离开当前通话并加入这里？")}
      confirmLabel={tt("离开并加入")}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { state, pending, activeCallId: call.callId, run, dialog };
}
