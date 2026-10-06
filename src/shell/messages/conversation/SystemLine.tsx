"use client";

// 系统消息（入群、改名、回放同意请求…）：居中一行小字，正文一律当纯文本。
import type { ImMessage } from "../../../lib/im/types";

export function SystemLine({ message }: { message: ImMessage }) {
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
