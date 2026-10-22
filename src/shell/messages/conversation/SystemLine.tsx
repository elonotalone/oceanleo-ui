"use client";

// 系统消息（入群、改名、回放同意请求…）：居中一行小字，正文一律当纯文本。
// 通话类系统消息（calls-v2 §3.4，按 `meta.kind` 认）交给 W08 的通话卡片；meta 缺省或不认识时照旧画一行字。
import type { ImMessage } from "../../../lib/im/types";
import { CallMessageCard, callMetaOf } from "../call/chat";

export function SystemLine({ message }: { message: ImMessage }) {
  if (callMetaOf(message)) return <CallMessageCard message={message} />;
  return (
    <div
      data-seq={message.seq}
      data-system-line=""
      className="my-2 flex justify-center px-6 text-center text-[12px] leading-5 text-neutral-400"
    >
      <span className="max-w-full break-words">{message.body}</span>
    </div>
  );
}
