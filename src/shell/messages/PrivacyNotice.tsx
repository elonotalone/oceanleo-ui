"use client";

// 隐私说明（契约 §9.7）：平台不主动看消息、没有端到端加密、被举报的内容会进人工审核。
// 首次打开浮层时弹一次（记 localStorage），设置页里常驻同一段文字。
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

/** 说明正文（设置页与首次弹窗共用）。 */
export function PrivacySummary() {
  const tt = useUI();
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-black/70 dark:text-white/70">
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
      role="alertdialog"
      aria-modal="true"
      aria-label={tt("隐私说明")}
      data-testid="messages-privacy-notice"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl dark:bg-neutral-800">
        <div className="mb-2 text-base font-semibold">{tt("先说清楚：消息怎么处理")}</div>
        <PrivacySummary />
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={acknowledge}
            className="rounded-md bg-sky-500 px-4 py-1.5 text-sm text-white hover:bg-sky-600"
          >
            {tt("知道了")}
          </button>
        </div>
      </div>
    </div>
  );
}
