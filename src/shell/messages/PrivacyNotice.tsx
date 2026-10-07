"use client";

// 隐私说明（契约 §9.7）：平台不主动看消息、没有端到端加密、被举报的内容会进人工审核。
// 首次打开浮层时在顶上出一条可关掉的提示（记 localStorage），设置页里常驻同一段文字。
import { useCallback, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";

export const PRIVACY_ACK_KEY = "oceanleo:im:privacy-ack-v1";

export function privacyAcknowledged(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(PRIVACY_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

function localStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 说明正文（设置页与首次提示共用）。 */
export function PrivacySummary() {
  const tt = useUI();
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-6 text-black/55 dark:text-white/55">
      <li>{tt("消息在传输和存储时都是加密的，但不是端到端加密。")}</li>
      <li>{tt("平台不会主动查看任何消息，Team 管理员也看不到成员之间的私聊。")}</li>
      <li>{tt("只有被举报的内容会进入人工审核；审核看到的是被举报的消息和举报人能看到的上下文。")}</li>
      <li>{tt("消息会一直保留；你可以撤回自己的消息，撤回后正文和附件会被清除。")}</li>
    </ul>
  );
}

export function PrivacyNotice() {
  const tt = useUI();
  const [visible, setVisible] = useState(() => !privacyAcknowledged(localStore()));
  const acknowledge = useCallback(() => {
    try {
      localStore()?.setItem(PRIVACY_ACK_KEY, "1");
    } catch {
      /* 隐私模式：本次关掉即可 */
    }
    setVisible(false);
  }, []);
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label={tt("隐私说明")}
      data-testid="messages-privacy-notice"
      data-im-privacy-banner
    >
      <p className="min-w-0 flex-1">{tt("消息在传输和存储时都是加密的，但不是端到端加密。")}</p>
      <button
        type="button"
        autoFocus
        onClick={acknowledge}
        className="shrink-0 text-[12px] font-medium text-neutral-800 underline-offset-2 hover:underline dark:text-neutral-100"
      >
        {tt("知道了")}
      </button>
    </div>
  );
}
