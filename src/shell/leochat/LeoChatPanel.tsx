"use client";

// 右侧栏里的 LeoChat。属性是合同 §3.2 定的，不许改。显示着才认领 panel 这一处。
import { useEffect, useRef, type ReactElement } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { useImEnabled } from "../../lib/im/client";
import { BaySignInPrompt } from "../bay/shell/BayMine";
import { hostState, useMessagesHost } from "../messages/host-state";
import { ensureMessagesSurfaceStyles } from "../messages/messages-surface";
import { useImUnread } from "../messages/realtime/hooks";
import type { WorkspaceChatRequest } from "../workspace-actions";
import { LeoChatBody } from "./leochat-body";
import { LeoChatTabs } from "./LeoChatTabs";

export type LeoChatPanelRequest = WorkspaceChatRequest;

export interface LeoChatPanelProps {
  /** 这一块此刻是不是右侧栏正显示的那一块。显示着才认领 LeoChat（见 host-state 的 claimSurface）。 */
  active: boolean;
  /** 进来时直接停在这条会话；`nonce` 变了才算新请求。没有过就是 null。 */
  request: LeoChatPanelRequest | null;
  /** 栏内还有上一层可退时交出一个函数（右侧栏顶上的「返回」先调它）；退到头交 null。 */
  onBackChange?: (back: (() => void) | null) => void;
  /** 小窗或整页把 LeoChat 接走了：右侧栏该回到卡片。 */
  onEvicted?: () => void;
}

export function LeoChatPanel({ active, request, onBackChange, onEvicted }: LeoChatPanelProps): ReactElement {
  const tt = useUI();
  const imOn = useImEnabled();
  const state = useMessagesHost();
  const unread = useImUnread();
  const onEvictedRef = useRef(onEvicted);
  const onBackChangeRef = useRef(onBackChange);
  onEvictedRef.current = onEvicted;
  onBackChangeRef.current = onBackChange;
  const requestNonce = request?.nonce;
  const requestConversationId = request?.conversationId;
  const threadOpen = state.view === "inbox" && Boolean(state.conversationId);

  useEffect(() => {
    ensureMessagesSurfaceStyles();
  }, []);

  useEffect(() => {
    if (!imOn || !active) return undefined;
    return hostState().claimSurface("panel", () => onEvictedRef.current?.());
  }, [active, imOn]);

  // 一条请求只接一次：之后人自己关了会话、回到卡片再进来，不能被旧请求又拉回那条会话。
  const appliedNonceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!imOn || !active || !requestNonce) return;
    if (appliedNonceRef.current === requestNonce) return;
    appliedNonceRef.current = requestNonce;
    hostState().open({ conversationId: requestConversationId });
  }, [active, imOn, requestNonce, requestConversationId]);

  useEffect(() => {
    const back = threadOpen ? () => hostState().showConversation(null) : null;
    onBackChangeRef.current?.(back);
    return () => onBackChangeRef.current?.(null);
  }, [threadOpen]);

  if (!imOn) {
    return (
      <div data-leochat-panel className="flex h-full min-h-0 flex-col bg-white">
        <BaySignInPrompt text={tt("登录后查看聊天和联系人")} />
      </div>
    );
  }

  return (
    <div data-leochat-panel className="flex h-full min-h-0 flex-col bg-white">
      {threadOpen ? null : (
        <div className="flex justify-center border-b border-stone-200 px-3 py-2">
          <LeoChatTabs
            active={state.view}
            onSelect={(view) => hostState().setView(view)}
            badges={{ inbox: unread?.total ?? 0, people: unread?.requests ?? 0 }}
          />
        </div>
      )}
      <LeoChatBody wide={false} />
    </div>
  );
}
