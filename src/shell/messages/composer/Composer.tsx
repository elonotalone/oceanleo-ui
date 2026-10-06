"use client";

// 输入框。B1 版：多行文字，Enter 发送、Shift+Enter 换行。
import { useState } from "react";
import type { ConversationStore } from "../conversation/conversation-store";

export function Composer({ store }: { store: ConversationStore }) {
  const [text, setText] = useState("");
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    void store.send({ kind: "text", body });
  };
  return (
    <div className="border-t border-neutral-200 p-2">
      <textarea
        value={text}
        rows={2}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className="w-full resize-none rounded-lg border border-neutral-200 p-2 text-sm focus:outline-none"
      />
    </div>
  );
}
