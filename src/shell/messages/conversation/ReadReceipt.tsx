"use client";

// 读状态：私聊 = 我的最后一条下「已读」；群 = 我发的、带 @ 的消息，悬停看被 @ 的人谁读了（只有自己看得到）。
import { useUI } from "../../../i18n/ui/useUI";
import type { ImMessage } from "../../../lib/im/types";

/** 私聊：这条是不是「我发的最后一条」且对方已读到它。 */
export function dmReadState(
  message: ImMessage,
  lastOwnSeq: number,
  peerLastReadSeq: number,
): "read" | "sent" | null {
  if (message.seq !== lastOwnSeq || message.seq <= 0) return null;
  return peerLastReadSeq >= message.seq ? "read" : "sent";
}

export function DmReadReceipt({ read }: { read: boolean }) {
  const tt = useUI();
  return (
    <span className="text-[11px] text-neutral-400" data-read-receipt={read ? "read" : "sent"}>
      {read ? tt("已读") : tt("已送达")}
    </span>
  );
}

export function MentionReadReceipt({
  reads,
  nameOf,
}: {
  reads: Record<string, boolean>;
  nameOf: (userId: string) => string;
}) {
  const tt = useUI();
  const ids = Object.keys(reads);
  if (ids.length === 0) return null;
  const done = ids.filter((id) => reads[id]);
  const waiting = ids.filter((id) => !reads[id]);
  const title =
    (done.length ? `${tt("已读")}：${done.map(nameOf).join("、")}` : "") +
    (done.length && waiting.length ? "\n" : "") +
    (waiting.length ? `${tt("未读")}：${waiting.map(nameOf).join("、")}` : "");
  return (
    <span className="cursor-default text-[11px] text-neutral-400" title={title} data-mention-reads="">
      {tt("{read}/{total} 人已读", { read: done.length, total: ids.length })}
    </span>
  );
}
