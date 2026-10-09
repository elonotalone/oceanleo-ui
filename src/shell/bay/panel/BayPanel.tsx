"use client";

// 右侧栏里的 LeoBay（缩小版）。属性是合同 §3.2 定的，不许改；实现由第四波 W2 整份重写。
import type { ReactElement } from "react";
import type { WorkspaceBayRequest } from "../../workspace-actions";

export type BayPanelRequest = WorkspaceBayRequest;

export interface BayPanelProps {
  siteKey: string;
  /** 这一块此刻是不是右侧栏正显示的那一块。藏着的时候不登记在场、不发请求。 */
  active: boolean;
  /** agent 的「找相关服务」请求；`nonce` 变了才算新请求。没有过就是 null。 */
  request: BayPanelRequest | null;
  /** 栏内还有上一层可退时交出一个函数（右侧栏顶上的「返回」先调它）；退到头交 null。 */
  onBackChange?: (back: (() => void) | null) => void;
  /** 「先聊聊」：让右侧栏换到 LeoChat 的这条会话（`talent:<threadId>`）。 */
  onOpenConversation?: (conversationId: string) => void;
}

export function BayPanel(_props: BayPanelProps): ReactElement | null {
  return null;
}
