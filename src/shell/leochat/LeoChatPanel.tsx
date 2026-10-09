"use client";

// 右侧栏里的 LeoChat。属性是合同 §3.2 定的，不许改；实现由第四波 W4 整份重写。
import type { ReactElement } from "react";
import type { WorkspaceChatRequest } from "../workspace-actions";

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

export function LeoChatPanel(_props: LeoChatPanelProps): ReactElement | null {
  return null;
}
