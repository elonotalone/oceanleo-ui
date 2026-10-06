"use client";

// 交易会话里的一行灰字：交易事件（契约 §3.8）或签约后的「已签约，之后在项目群里沟通」（§3.10）。
// 文案按 `meta.event` 翻译，没见过的事件显示服务端的中文兜底；全部当纯文字渲染。

import { useUI } from "../../../i18n/ui/useUI";
import { runDealLineAction } from "./deal-actions";
import { resolveDealLine, type DealLineTarget } from "./deal-lines";

export interface DealSystemLineProps {
  message: { id: string; body?: string | null; meta?: Record<string, unknown> | null; created_at?: string };
  /** 会话关联的合同；事件行自己没带 `contract_id` 时「查看订单」用它。 */
  contractId?: string | null;
  /** 测试与特殊宿主可接管动作；默认按目标打开 Bay / 消息窗 / 设置。 */
  onAction?: (target: DealLineTarget) => void;
}

export function DealSystemLine({ message, contractId = null, onAction = runDealLineAction }: DealSystemLineProps) {
  const tt = useUI();
  const line = resolveDealLine(tt, message, contractId);
  if (!line.text) return null;
  return (
    <li
      data-message-id={message.id}
      data-message-kind="system"
      data-deal-event={line.event ?? ""}
      className="flex flex-col items-center gap-1 px-2 text-center text-[12px] leading-snug text-neutral-500"
    >
      <span className="max-w-full whitespace-pre-wrap break-words">{line.text}</span>
      {line.action ? (
        <button
          type="button"
          data-deal-action={line.action.kind}
          onClick={() => line.action && onAction(line.action.target)}
          className="rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-[12px] text-neutral-700 hover:bg-neutral-50"
        >
          {line.action.label}
        </button>
      ) : null}
    </li>
  );
}
